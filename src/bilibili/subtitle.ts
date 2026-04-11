import {
  checkLoginStatus,
  getSubtitleContent,
  getVideoInfoByAid,
  getVideoInfoByBvid,
  getVideoSubtitle,
  searchVideos,
} from "./client.js";
import { cacheManager } from "../utils/cache.js";
import { extractBVId } from "../utils/bvid.js";
import { BilibiliAPIError } from "../utils/errors.js";

const LANGUAGE_PRIORITY = ["zh-Hans", "ai-zh", "zh-CN", "zh-Hant", "en"];

function formatPublishDate(timestamp: number | undefined): string | undefined {
  if (!timestamp) {
    return undefined;
  }
  return new Date(timestamp * 1000).toISOString();
}

function extractTags(videoData: any): string[] {
  if (!Array.isArray(videoData?.tag)) {
    return [];
  }
  return videoData.tag.map((item: any) => item.tag_name).filter(Boolean);
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
    const matched = subtitles.find(
      (item) => item.lan === lang || item.lan.includes(lang),
    );
    if (matched) {
      return matched;
    }
  }

  return subtitles[0];
}

function mergeSubtitleBody(body: Array<{ from: number; to: number; content: string }>): string {
  return body.map((item) => item.content.trim()).filter(Boolean).join("\n");
}

export async function resolveVideoInput(input: string): Promise<any> {
  try {
    const bvid = extractBVId(input);
    return getVideoInfoByBvid(bvid);
  } catch {
    const avMatch = input.match(/(?:^|\/|av)(\d{5,})/i);
    if (avMatch) {
      return getVideoInfoByAid(Number(avMatch[1]));
    }

    const result = await searchVideos(input, 1, 1);
    const first = result?.result?.[0];
    if (!first?.bvid) {
      throw new BilibiliAPIError(
        "没有找到匹配的视频。",
        "VIDEO_NOT_FOUND",
        undefined,
        result,
        false,
        "请改用更具体的关键词，或直接传入 BV 号/视频链接。",
      );
    }
    return getVideoInfoByBvid(first.bvid);
  }
}

export async function getResolvedVideoSummary(input: string): Promise<any> {
  const video = await resolveVideoInput(input);
  return {
    title: video.title,
    bvid: video.bvid,
    aid: video.aid,
    cid: video.cid,
    url: `https://www.bilibili.com/video/${video.bvid}`,
    author: video.owner?.name,
    description: video.desc || "",
    duration: video.duration,
    publish_time: formatPublishDate(video.pubdate),
  };
}

export async function getVideoInfoWithSubtitle(
  input: string,
  preferredLang?: string,
): Promise<any> {
  const cacheKey = cacheManager.generateKey("video-info", input, preferredLang ?? "default");
  const cached = cacheManager.getVideoInfo(cacheKey);
  if (cached) {
    return cached;
  }

  const videoData = await resolveVideoInput(input);
  const title = videoData.title;
  const description = videoData.desc || "";
  const tags = extractTags(videoData);
  const cid = videoData.cid;
  const pubdate = videoData.pubdate;
  const pages = Array.isArray(videoData.pages)
    ? videoData.pages.map((page: any) => ({
        page: page.page,
        part: page.part,
        cid: page.cid,
        duration: page.duration,
      }))
    : [];

  try {
    const subtitleData = await getVideoSubtitle(videoData.bvid, cid);
    const subtitles = subtitleData?.subtitle?.subtitles ?? [];
    if (subtitles.length === 0) {
      const login = await checkLoginStatus();
      if (!login.isLogin) {
        throw new BilibiliAPIError(
          "当前 B 站登录态无效，无法获取字幕。",
          "BILIBILI_COOKIE_INVALID",
          undefined,
          { bvid: videoData.bvid },
          true,
          "请确认 CookieCloud 中的 B 站登录态仍然有效。",
        );
      }

      const fallback = {
        data_source: "description",
        video_info: {
          title,
          bvid: videoData.bvid,
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
        "该视频可能没有可用字幕。",
      );
    }

    const content = await getSubtitleContent(selected.subtitle_url);
    const subtitleBody = Array.isArray(content?.body) ? content.body : [];
    const result = {
      data_source: "subtitle",
      video_info: {
        title,
        bvid: videoData.bvid,
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
      },
    };
    cacheManager.setVideoInfo(cacheKey, fallback);
    return fallback;
  }
}
