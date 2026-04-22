import { cacheManager } from "../utils/cache.js";
import { CommentsDisabledError } from "../utils/errors.js";
import {
  getDanmakuXml,
  getHotVideos,
  getRelatedVideos,
  getVideoComments,
  searchVideos,
} from "./client.js";
import { resolveVideoWithPage } from "./subtitle.js";

function filterEmojis(text: string): string {
  return text.replace(/\[[^\]]+\]/g, "").trim();
}

function extractTimestamp(text: string): string | null {
  const matches = text.match(/\b(\d{1,2}:)?\d{1,2}:\d{2}\b/g);
  return matches ? matches[0] : null;
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

function stripHtml(value: string | undefined): string {
  return (value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeSearchItem(item: any) {
  return {
    title: stripHtml(item.title),
    bvid: item.bvid,
    url: item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : undefined,
    author: item.author,
    play_count: item.play,
    duration: item.duration || null,
    publish_time: item.pubdate ? new Date(item.pubdate * 1000).toISOString() : undefined,
    description: stripHtml(item.description),
  };
}

export async function searchVideoItems(keyword: string, page = 1, pageSize = 10) {
  const data = await searchVideos(keyword, page, pageSize);
  const list = Array.isArray(data?.result) ? data.result : [];
  return {
    keyword,
    page,
    page_size: pageSize,
    total: data?.numResults ?? list.length,
    items: list.slice(0, pageSize).map(normalizeSearchItem),
  };
}

export async function getVideoCommentsData(
  input: string,
  detailLevel: "brief" | "detailed" = "brief",
) {
  const context = await resolveVideoWithPage(input, 1);
  const bvid = context.videoData.bvid;
  const cacheKey = cacheManager.generateKey("comments", bvid, detailLevel);
  const cached = cacheManager.getCommentInfo(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const pageSize = detailLevel === "brief" ? 10 : 20;
    const response = await getVideoComments(bvid, 1, pageSize, 1);
    const rawComments = Array.isArray(response?.replies) ? response.replies : [];

    const comments = rawComments.flatMap((comment: any) => {
      const mainContent = filterEmojis(comment?.content?.message || "");
      const timestamp = extractTimestamp(mainContent);
      const normalized = {
        author: comment?.member?.uname || "匿名用户",
        content: mainContent,
        likes: comment?.like || 0,
        has_timestamp: Boolean(timestamp),
        timestamp: timestamp || undefined,
      };

      if (detailLevel !== "detailed" || !Array.isArray(comment?.replies)) {
        return [normalized];
      }

      const replies = comment.replies.slice(0, 3).map((reply: any) => {
        const replyContent = filterEmojis(reply?.content?.message || "");
        const replyTimestamp = extractTimestamp(replyContent);
        return {
          author: reply?.member?.uname || "匿名用户",
          content: replyContent,
          likes: reply?.like || 0,
          has_timestamp: Boolean(replyTimestamp),
          timestamp: replyTimestamp || undefined,
        };
      });

      return [normalized, ...replies];
    });

    comments.sort((left: any, right: any) => {
      if (left.has_timestamp && !right.has_timestamp) return -1;
      if (!left.has_timestamp && right.has_timestamp) return 1;
      return right.likes - left.likes;
    });

    const result = {
      comments,
      summary: {
        total_comments: comments.length,
        comments_with_timestamp: comments.filter((item: any) => item.has_timestamp).length,
      },
    };
    cacheManager.setCommentInfo(cacheKey, result);
    return result;
  } catch (error) {
    if (error instanceof CommentsDisabledError) {
      return {
        comments: [],
        summary: {
          total_comments: 0,
          comments_with_timestamp: 0,
        },
      };
    }
    throw error;
  }
}

export async function getVideoDanmaku(input: string, limit = 100, page = 1) {
  const context = await resolveVideoWithPage(input, page);
  const xml = await getDanmakuXml(context.selectedCid);
  const matches = [...xml.matchAll(/<d p="([^"]+)">([\s\S]*?)<\/d>/g)];
  const items = matches.slice(0, Math.min(limit, 200)).map((match) => {
    const [time] = match[1].split(",");
    return {
      time_seconds: Number(time),
      time_text: formatDuration(Math.floor(Number(time))),
      content: match[2]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"'),
    };
  });

  return {
    bvid: context.videoData.bvid,
    cid: context.selectedCid,
    total: matches.length,
    returned: items.length,
    truncated: matches.length > items.length,
    selected_page: context.selectedPage,
    selected_part: context.selectedPart,
    items,
  };
}

export async function getVideoDetail(input: string, page = 1) {
  const context = await resolveVideoWithPage(input, page);
  const video = context.videoData;
  return {
    title: video.title,
    bvid: video.bvid,
    aid: video.aid,
    cid: context.selectedCid,
    url: `https://www.bilibili.com/video/${video.bvid}`,
    description: video.desc || "",
    cover: video.pic,
    author: {
      name: video.owner?.name,
      mid: video.owner?.mid,
      avatar: video.owner?.face,
    },
    duration_seconds: video.duration,
    duration_text: formatDuration(video.duration),
    publish_time: video.pubdate ? new Date(video.pubdate * 1000).toISOString() : undefined,
    statistics: {
      view: video.stat?.view ?? 0,
      danmaku: video.stat?.danmaku ?? 0,
      reply: video.stat?.reply ?? 0,
      favorite: video.stat?.favorite ?? 0,
      coin: video.stat?.coin ?? 0,
      share: video.stat?.share ?? 0,
      like: video.stat?.like ?? 0,
    },
    tags: Array.isArray(video.tag) ? video.tag.map((item: any) => item.tag_name) : [],
    pages: context.pages.map((item) => ({
      page: item.page,
      cid: item.cid,
      part: item.part,
      duration_seconds: item.duration,
      duration_text: formatDuration(item.duration),
    })),
    selected_page: context.selectedPage,
    selected_cid: context.selectedCid,
    selected_part: context.selectedPart,
    login_required: Boolean(video.need_login_subtitle),
  };
}

export async function getHotVideoItems(limit = 10) {
  const items = await getHotVideos(limit);
  return {
    total: items.length,
    items: items.map((item) => ({
      title: item.title,
      bvid: item.bvid,
      url: `https://www.bilibili.com/video/${item.bvid}`,
      author: item.owner?.name,
      play_count: item.stat?.view ?? 0,
      duration: formatDuration(item.duration),
      publish_time: item.pubdate ? new Date(item.pubdate * 1000).toISOString() : undefined,
      description: item.desc || "",
    })),
  };
}

export async function getRelatedVideoItems(input: string) {
  const context = await resolveVideoWithPage(input, 1);
  const bvid = context.videoData.bvid;
  const items = await getRelatedVideos(bvid);
  return {
    bvid,
    total: items.length,
    items: items.slice(0, 10).map((item) => ({
      title: item.title,
      bvid: item.bvid,
      url: `https://www.bilibili.com/video/${item.bvid}`,
      author: item.owner?.name,
      play_count: item.stat?.view ?? 0,
      duration: formatDuration(item.duration),
    })),
  };
}

export async function getResolvedVideoData(input: string, page = 1) {
  const context = await resolveVideoWithPage(input, page);
  const video = context.videoData;
  return {
    title: video.title,
    bvid: video.bvid,
    aid: video.aid,
    cid: context.selectedCid,
    url: `https://www.bilibili.com/video/${video.bvid}`,
    author: video.owner?.name,
    duration: formatDuration(video.duration),
    publish_time: video.pubdate ? new Date(video.pubdate * 1000).toISOString() : undefined,
    description: video.desc || "",
    pages: context.pages.map((item) => ({
      page: item.page,
      cid: item.cid,
      part: item.part,
      duration_seconds: item.duration,
      duration_text: formatDuration(item.duration),
    })),
    selected_page: context.selectedPage,
    selected_cid: context.selectedCid,
    selected_part: context.selectedPart,
  };
}
