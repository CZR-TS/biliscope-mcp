import {
  checkLoginStatus,
  getSubtitleContent,
  getVideoInfoByAid,
  getVideoInfoByBvid,
  getVideoSubtitle,
  searchVideos,
} from "./client.js";
import { cacheManager } from "../utils/cache.js";
import { extractBVId, resolveBilibiliVideoInput } from "../utils/bvid.js";
import { BilibiliAPIError, ValidationError } from "../utils/errors.js";

const LANGUAGE_PRIORITY = ["zh-Hans", "ai-zh", "zh-CN", "zh-Hant", "en"];

export interface VideoPageInfo {
  page: number;
  part: string;
  cid: number;
  duration: number;
}

export interface ResolvedVideoContext {
  videoData: any;
  pages: VideoPageInfo[];
  selectedPage: number;
  selectedCid: number;
  selectedPart: string;
}

function formatPublishDate(timestamp: number | undefined): string | undefined {
  if (!timestamp) {
    return undefined;
  }
  return new Date(timestamp * 1000).toISOString();
}

function formatDuration(seconds: number | undefined): string | null {
  if (!seconds || seconds < 0) {
    return null;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  if (hours > 0) {
    return [hours, minutes, remaining].map((item) => String(item).padStart(2, "0")).join(":");
  }
  return [minutes, remaining].map((item) => String(item).padStart(2, "0")).join(":");
}

function extractTags(videoData: any): string[] {
  if (!Array.isArray(videoData?.tag)) {
    return [];
  }
  return videoData.tag.map((item: any) => item.tag_name).filter(Boolean);
}

function normalizePages(videoData: any): VideoPageInfo[] {
  const pages = Array.isArray(videoData?.pages)
    ? videoData.pages
        .map((page: any, index: number) => ({
          page: Number(page?.page ?? index + 1),
          part: String(page?.part ?? `P${index + 1}`),
          cid: Number(page?.cid ?? videoData.cid),
          duration: Number(page?.duration ?? videoData.duration ?? 0),
        }))
        .filter((page: VideoPageInfo) => Number.isFinite(page.cid) && page.cid > 0)
    : [];

  if (pages.length > 0) {
    return pages;
  }

  return [
    {
      page: 1,
      part: videoData?.title || "P1",
      cid: Number(videoData?.cid),
      duration: Number(videoData?.duration ?? 0),
    },
  ].filter((page) => Number.isFinite(page.cid) && page.cid > 0);
}

function selectBestSubtitle(
  subtitles: Array<{ id: number; lan: string; lan_doc: string; subtitle_url: string }>,
  preferredLang?: string,
) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return null;
  }

  if (preferredLang) {
    const exact = subtitles.find(
      (item) => item.lan === preferredLang || item.lan_doc.includes(preferredLang),
    );
    if (exact) {
      return exact;
    }
  }

  for (const lang of LANGUAGE_PRIORITY) {
    const matched = subtitles.find((item) => item.lan === lang || item.lan.includes(lang));
    if (matched) {
      return matched;
    }
  }

  return subtitles[0];
}

function mergeSubtitleBody(body: Array<{ from: number; to: number; content: string }>): string {
  return body.map((item) => item.content.trim()).filter(Boolean).join("\n");
}

function buildSelectedPageInfo(context: ResolvedVideoContext) {
  return {
    selected_page: context.selectedPage,
    selected_cid: context.selectedCid,
    selected_part: context.selectedPart,
  };
}

export async function resolveVideoInput(input: string): Promise<any> {
  const normalizedInput = await resolveBilibiliVideoInput(input);
  try {
    const bvid = extractBVId(normalizedInput);
    return getVideoInfoByBvid(bvid);
  } catch {
    const avMatch = normalizedInput.match(/(?:^|\/|av)(\d{5,})/i);
    if (avMatch) {
      return getVideoInfoByAid(Number(avMatch[1]));
    }

    const result = await searchVideos(normalizedInput, 1, 1);
    const first = result?.result?.[0];
    if (!first?.bvid) {
      throw new BilibiliAPIError(
        "没有找到匹配的视频。",
        "VIDEO_NOT_FOUND",
        undefined,
        result,
        false,
        "请改用更具体的关键词，或直接传入 BV 号、AV 号或视频链接。",
      );
    }
    return getVideoInfoByBvid(first.bvid);
  }
}

export async function resolveVideoWithPage(input: string, page: number = 1): Promise<ResolvedVideoContext> {
  const videoData = await resolveVideoInput(input);
  const pages = normalizePages(videoData);
  const selected = pages.find((item) => item.page === page);

  if (!selected) {
    throw new ValidationError("page 超出当前视频的分P范围。", {
      fieldErrors: [
        {
          field: "page",
          message: `当前视频共有 ${pages.length} 个分P，可选 ${pages.map((item) => item.page).join(", ")}。`,
          received: page,
          expected: `1 到 ${pages.length} 的分P序号`,
          allowed_values: pages.map((item) => item.page),
        },
      ],
      expected: {
        input: "BV/AV/视频链接/关键词",
        page: `可选；当前视频支持 ${pages.map((item) => item.page).join(", ")}`,
      },
    });
  }

  return {
    videoData,
    pages,
    selectedPage: selected.page,
    selectedCid: selected.cid,
    selectedPart: selected.part,
  };
}

export async function getResolvedVideoSummary(input: string, page: number = 1): Promise<any> {
  const context = await resolveVideoWithPage(input, page);
  const { videoData, pages } = context;
  return {
    title: videoData.title,
    bvid: videoData.bvid,
    aid: videoData.aid,
    cid: context.selectedCid,
    url: `https://www.bilibili.com/video/${videoData.bvid}`,
    author: videoData.owner?.name,
    description: videoData.desc || "",
    duration: formatDuration(videoData.duration),
    publish_time: formatPublishDate(videoData.pubdate),
    pages: pages.map((item) => ({
      page: item.page,
      cid: item.cid,
      part: item.part,
      duration_seconds: item.duration,
      duration_text: formatDuration(item.duration),
    })),
    ...buildSelectedPageInfo(context),
  };
}

export async function getVideoInfoWithSubtitle(
  input: string,
  preferredLang?: string,
  page: number = 1,
): Promise<any> {
  const cacheKey = cacheManager.generateKey(
    "video-info",
    input,
    preferredLang ?? "default",
    page,
  );
  const cached = cacheManager.getVideoInfo(cacheKey);
  if (cached) {
    return cached;
  }

  const context = await resolveVideoWithPage(input, page);
  const { videoData, pages, selectedCid } = context;
  const title = videoData.title;
  const description = videoData.desc || "";
  const tags = extractTags(videoData);
  const pubdate = videoData.pubdate;

  try {
    const subtitleData = await getVideoSubtitle(videoData.bvid, selectedCid);
    const subtitles = subtitleData?.subtitle?.subtitles ?? [];
    if (subtitles.length === 0) {
      const login = await checkLoginStatus();
      if (!login.isLogin) {
        throw new BilibiliAPIError(
          "当前 B 站登录态无效，无法获取字幕。",
          "BILIBILI_COOKIE_INVALID",
          undefined,
          { bvid: videoData.bvid, page: context.selectedPage, cid: selectedCid },
          true,
          "请确认 CookieCloud 中的 B 站登录态仍然有效。",
        );
      }

      const fallback = {
        data_source: "description",
        video_info: {
          title,
          bvid: videoData.bvid,
          cid: selectedCid,
          url: `https://www.bilibili.com/video/${videoData.bvid}`,
          author: videoData.owner?.name,
          description,
          tags,
          publish_time: formatPublishDate(pubdate),
          publish_timestamp: pubdate,
          statistics: {
            view: videoData.stat?.view ?? 0,
            danmaku: videoData.stat?.danmaku ?? 0,
            reply: videoData.stat?.reply ?? 0,
            like: videoData.stat?.like ?? 0,
          },
          pages,
          login_required: Boolean(videoData.need_login_subtitle),
          ...buildSelectedPageInfo(context),
        },
      };
      cacheManager.setVideoInfo(cacheKey, fallback);
      return fallback;
    }

    const selected = selectBestSubtitle(subtitles, preferredLang);
    if (!selected) {
      throw new BilibiliAPIError(
        "字幕列表为空。",
        "SUBTITLE_NOT_FOUND",
        undefined,
        subtitleData,
        false,
        "该视频当前没有可用字幕。",
      );
    }

    const content = await getSubtitleContent(selected.subtitle_url);
    const subtitleBody = Array.isArray(content?.body) ? content.body : [];
    const result = {
      data_source: "subtitle",
      video_info: {
        title,
        bvid: videoData.bvid,
        cid: selectedCid,
        url: `https://www.bilibili.com/video/${videoData.bvid}`,
        author: videoData.owner?.name,
        description,
        tags,
        publish_time: formatPublishDate(pubdate),
        publish_timestamp: pubdate,
        subtitle_language: selected.lan,
        subtitle_language_label: selected.lan_doc,
        subtitle_text: mergeSubtitleBody(subtitleBody),
        subtitle_segments: subtitleBody.map((item: any) => ({
          from: item.from,
          to: item.to,
          content: item.content,
        })),
        statistics: {
          view: videoData.stat?.view ?? 0,
          danmaku: videoData.stat?.danmaku ?? 0,
          reply: videoData.stat?.reply ?? 0,
          like: videoData.stat?.like ?? 0,
        },
        pages,
        login_required: Boolean(videoData.need_login_subtitle),
        ...buildSelectedPageInfo(context),
      },
    };

    cacheManager.setVideoInfo(cacheKey, result);
    return result;
  } catch (error) {
    if (error instanceof BilibiliAPIError) {
      throw error;
    }

    const fallback = {
      data_source: "description",
      video_info: {
        title,
        bvid: videoData.bvid,
        cid: selectedCid,
        url: `https://www.bilibili.com/video/${videoData.bvid}`,
        author: videoData.owner?.name,
        description,
        tags,
        publish_time: formatPublishDate(pubdate),
        publish_timestamp: pubdate,
        statistics: {
          view: videoData.stat?.view ?? 0,
          danmaku: videoData.stat?.danmaku ?? 0,
          reply: videoData.stat?.reply ?? 0,
          like: videoData.stat?.like ?? 0,
        },
        pages,
        login_required: Boolean(videoData.need_login_subtitle),
        ...buildSelectedPageInfo(context),
      },
    };
    cacheManager.setVideoInfo(cacheKey, fallback);
    return fallback;
  }
}
