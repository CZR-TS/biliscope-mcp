import { createHash } from "crypto";
import { config } from "../config.js";
import {
  BilibiliAPIError,
  CommentsDisabledError,
  NetworkError,
  TimeoutError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { credentialManager } from "../utils/credentials.js";

const BASE_URL = config.baseUrl;

let cachedWBI:
  | { imgKey: string; subKey: string; mixKey: string; expireTime: number }
  | null = null;
let cachedBuvid:
  | { buvid3: string; buvid4: string; expireTime: number }
  | null = null;
let lastRequestTime = 0;
let pendingPromise: Promise<void> | null = null;

function md5Hash(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function getMixKey(imgKey: string, subKey: string): string {
  const saltTable = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
  ];
  const mixKey = imgKey + subKey;
  return saltTable.map((index) => mixKey[index]).join("");
}

function isAuthFailure(error: unknown): boolean {
  if (error instanceof BilibiliAPIError) {
    return [
      "COOKIE_EXPIRED",
      "BILIBILI_AUTH_REQUIRED",
      "BILIBILI_COOKIE_INVALID",
      "ACCESS_DENIED",
    ].includes(error.code);
  }

  if (error instanceof NetworkError) {
    return error.statusCode === 401 || error.statusCode === 412;
  }

  return false;
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const delta = now - lastRequestTime;
  if (delta < config.rateLimitMs) {
    await new Promise((resolve) => setTimeout(resolve, config.rateLimitMs - delta));
  }
  lastRequestTime = Date.now();
}

async function throttledFetch<T>(task: (controller: AbortController) => Promise<T>): Promise<T> {
  if (pendingPromise) {
    await pendingPromise;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  pendingPromise = waitForRateLimit();

  try {
    await pendingPromise;
    return await task(controller);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutError(`请求超时：${config.requestTimeoutMs}ms`, config.requestTimeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    pendingPromise = null;
  }
}

async function retryableFetch<T>(task: () => Promise<T>): Promise<T> {
  return withRetry(task, {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    retryableErrorTypes: ["NetworkError", "TimeoutError", "AbortError"],
  });
}

function generateWbiRid(params: Record<string, string | number>, mixKey: string): string {
  const sortedQuery = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return md5Hash(sortedQuery + mixKey);
}

function mapBilibiliError(payload: any, url: string, includeAuth: boolean): BilibiliAPIError {
  const code = payload?.code;
  const message = payload?.message || payload?.msg || "未知错误";

  if (code === -101 || /未登录|登录|cookie/i.test(message)) {
    if (!includeAuth) {
      return new BilibiliAPIError(
        "B 站公开接口要求登录或临时拒绝了未登录请求。",
        "BILIBILI_PUBLIC_AUTH_REQUIRED",
        undefined,
        payload,
        true,
        "该工具本身不读取 CookieCloud；请稍后重试，或改用需要登录态的相关工具。",
      );
    }

    return new BilibiliAPIError(
      "B 站登录态已失效。",
      "BILIBILI_COOKIE_INVALID",
      undefined,
      payload,
      true,
      "请确认 CookieCloud 已同步到最新 B 站 Cookie。",
    );
  }

  if (code === -403 || code === -412) {
    return new BilibiliAPIError(
      "当前请求被 B 站拒绝，通常是登录态或风控问题。",
      "BILIBILI_AUTH_REQUIRED",
      undefined,
      payload,
      true,
      "请检查 CookieCloud 是否同步到最新浏览器状态。",
    );
  }

  if (code === -404 && message === "啥都木有") {
    return new BilibiliAPIError(
      "评论不可用。",
      "COMMENTS_DISABLED",
      undefined,
      payload,
      false,
      "该视频可能关闭了评论或当前接口不可访问。",
    );
  }

  return new BilibiliAPIError(
    `${message} (${code})`,
    "API_ERROR",
    undefined,
    { payload, url },
    false,
    "请稍后重试，或检查接口参数是否正确。",
  );
}

interface RequestOptions {
  includeAuth?: boolean;
  useWbi?: boolean;
  referer?: string;
  rawText?: boolean;
  appendBuvid?: boolean;
}

async function getWBI(): Promise<{ mixKey: string }> {
  const now = Date.now();
  if (cachedWBI && cachedWBI.expireTime > now) {
    return { mixKey: cachedWBI.mixKey };
  }

  const url = new URL("/x/web-interface/nav", BASE_URL);
  logger.logAPIRequest("GET", url.toString(), {});

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        "User-Agent": config.userAgent,
        Referer: config.referer,
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new NetworkError(
      `请求失败：${url.toString()}`,
      error instanceof Error ? error : undefined,
      url.toString(),
    );
  }

  if (!response.ok) {
    throw new NetworkError(
      `HTTP ${response.status}: ${response.statusText}`,
      undefined,
      url.toString(),
      response.status,
    );
  }

  const navPayload = await response.json();
  const navData = navPayload?.data;
  const wbiImg = navData?.wbi_img;
  const imgKeyMatch = wbiImg?.img_url?.match(/([^/_]+)(?=\.[a-zA-Z]+$)/);
  const subKeyMatch = wbiImg?.sub_url?.match(/([^/_]+)(?=\.[a-zA-Z]+$)/);

  if (!imgKeyMatch || !subKeyMatch) {
    throw new BilibiliAPIError(
      "无法获取 WBI 签名参数。",
      "WBI_DATA_MISSING",
      undefined,
      wbiImg,
      true,
      "稍后重试，或检查 B 站接口是否发生变化。",
    );
  }

  const mixKey = getMixKey(imgKeyMatch[0], subKeyMatch[0]);
  cachedWBI = {
    imgKey: imgKeyMatch[0],
    subKey: subKeyMatch[0],
    mixKey,
    expireTime: now + config.wbiCacheExpirationMs,
  };
  return { mixKey };
}

async function getBuvid(): Promise<{ buvid3: string; buvid4: string } | null> {
  const now = Date.now();
  if (cachedBuvid && cachedBuvid.expireTime > now) {
    return { buvid3: cachedBuvid.buvid3, buvid4: cachedBuvid.buvid4 };
  }

  try {
    const data = await rawRequest<any>(
      "/x/frontend/finger/spi",
      {},
      { includeAuth: false, useWbi: false },
    );
    if (!data?.b_3 || !data?.b_4) {
      return null;
    }
    cachedBuvid = {
      buvid3: data.b_3,
      buvid4: data.b_4,
      expireTime: now + 24 * 60 * 60 * 1000,
    };
    return { buvid3: data.b_3, buvid4: data.b_4 };
  } catch {
    return null;
  }
}

async function rawRequest<T>(
  path: string,
  params: Record<string, string | number>,
  options: RequestOptions = {},
): Promise<T> {
  const {
    includeAuth = true,
    useWbi = false,
    referer = config.referer,
    rawText = false,
    appendBuvid = false,
  } = options;

  const perform = async (forceRefresh: boolean): Promise<T> => {
    const headers: Record<string, string> = {
      "User-Agent": config.userAgent,
      Referer: referer,
      Accept: rawText ? "*/*" : "application/json",
    };

    if (includeAuth) {
      Object.assign(headers, await credentialManager.getAuthHeaders(forceRefresh));
    }

    if (appendBuvid) {
      const buvid = await getBuvid();
      if (buvid) {
        const buvidCookie = `buvid3=${buvid.buvid3}; buvid4=${buvid.buvid4}`;
        headers.Cookie = headers.Cookie ? `${headers.Cookie}; ${buvidCookie}` : buvidCookie;
      }
    }

    const requestParams = { ...params };
    if (useWbi) {
      const { mixKey } = await getWBI();
      requestParams.wts = Math.floor(Date.now() / 1000);
      requestParams.w_rid = generateWbiRid(requestParams, mixKey);
    }

    const url = new URL(path, BASE_URL);
    Object.entries(requestParams).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    return retryableFetch(async () =>
      throttledFetch(async (controller) => {
        logger.logAPIRequest("GET", url.toString(), requestParams);
        let response: Response;
        try {
          response = await fetch(url.toString(), { headers, signal: controller.signal });
        } catch (error) {
          throw new NetworkError(
            `请求失败：${url.toString()}`,
            error instanceof Error ? error : undefined,
            url.toString(),
          );
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 412) {
            throw new BilibiliAPIError(
              `B 站接口返回 HTTP ${response.status}。`,
              "BILIBILI_AUTH_REQUIRED",
              response.status,
              undefined,
              true,
              "CookieCloud 中的 B 站登录态可能已失效，请重新同步。",
            );
          }
          throw new NetworkError(
            `HTTP ${response.status}: ${response.statusText}`,
            undefined,
            url.toString(),
            response.status,
          );
        }

        if (rawText) {
          return (await response.text()) as T;
        }

        const json = await response.json();
        if (json.code !== 0) {
          throw mapBilibiliError(json, url.toString(), includeAuth);
        }
        return json.data as T;
      }),
    );
  };

  try {
    return await perform(false);
  } catch (error) {
    if (!includeAuth || !isAuthFailure(error)) {
      throw error;
    }
    await credentialManager.markAuthFailureAndRefresh();
    return perform(true);
  }
}

export async function checkLoginStatus(): Promise<{ isLogin: boolean }> {
  try {
    const data = await rawRequest<any>(
      "/x/web-interface/nav",
      {},
      { includeAuth: true, useWbi: false },
    );
    return { isLogin: data?.isLogin === true };
  } catch {
    return { isLogin: false };
  }
}

export async function getVideoInfoByBvid(bvid: string): Promise<any> {
  return rawRequest("/x/web-interface/view", { bvid }, { includeAuth: true });
}

export async function getVideoInfoByAid(aid: number): Promise<any> {
  return rawRequest("/x/web-interface/view", { aid }, { includeAuth: true });
}

export async function searchVideos(keyword: string, page = 1, pageSize = 10): Promise<any> {
  return rawRequest(
    "/x/web-interface/wbi/search/type",
    { search_type: "video", keyword, page, page_size: Math.min(pageSize, 20) },
    { includeAuth: false, useWbi: true },
  );
}

export async function getHotVideos(limit = 10): Promise<any[]> {
  const data = await rawRequest<any>(
    "/x/web-interface/popular",
    { pn: 1, ps: Math.min(limit, 20) },
    { includeAuth: false },
  );
  return Array.isArray(data?.list) ? data.list.slice(0, limit) : [];
}

export async function getBangumiTimeline(): Promise<any> {
  return rawRequest(
    "https://api.bilibili.com/pgc/web/timeline/v2",
    { day_before: 2, day_after: 4 },
    { includeAuth: false },
  );
}

export async function getUpInfo(mid: number): Promise<any> {
  return rawRequest("/x/space/wbi/acc/info", { mid }, { includeAuth: false, useWbi: true });
}

export async function getUpVideos(mid: number, page = 1, pageSize = 10): Promise<any> {
  return rawRequest(
    "/x/space/wbi/arc/search",
    { mid, pn: page, ps: Math.min(pageSize, 20), order: "pubdate" },
    { includeAuth: false, useWbi: true },
  );
}

export async function getRelatedVideos(bvid: string): Promise<any[]> {
  const data = await rawRequest<any>(
    "/x/web-interface/archive/related",
    { bvid },
    { includeAuth: false },
  );
  return Array.isArray(data) ? data : [];
}

export async function getVideoSubtitle(bvid: string, cid: number): Promise<any> {
  const data: any = await rawRequest(
    "/x/player/wbi/v2",
    { bvid, cid },
    { includeAuth: true, useWbi: true, appendBuvid: true },
  );
  if (data?.subtitle?.subtitles?.length) {
    return data;
  }
  return rawRequest(
    "/x/player/v2",
    { bvid, cid },
    { includeAuth: true, useWbi: false, appendBuvid: true },
  );
}

export async function getSubtitleContent(url: string): Promise<any> {
  const fullUrl = url.startsWith("http") ? url : `https:${url}`;
  const headers = await credentialManager.getAuthHeaders();
  const response = await fetch(fullUrl, {
    headers: {
      "User-Agent": config.userAgent,
      Referer: config.referer,
      ...headers,
    },
  });

  if (!response.ok) {
    throw new NetworkError(
      `字幕请求失败：HTTP ${response.status}`,
      undefined,
      fullUrl,
      response.status,
    );
  }
  return response.json();
}

export async function getVideoComments(
  bvid: string,
  page = 1,
  pageSize = 20,
  sort = 1,
): Promise<any> {
  const info = await getVideoInfoByBvid(bvid);
  const oid = info.aid;

  try {
    return await rawRequest(
      "/x/v2/reply/wbi/main",
      { oid, type: 1, mode: 3, pn: page, ps: Math.min(pageSize, 20), sort },
      {
        includeAuth: true,
        useWbi: true,
        appendBuvid: true,
        referer: `https://www.bilibili.com/video/${bvid}/`,
      },
    );
  } catch (error) {
    if (error instanceof BilibiliAPIError && error.code === "COMMENTS_DISABLED") {
      throw new CommentsDisabledError();
    }
    return rawRequest(
      "/x/v2/reply/main",
      { oid, type: 1, mode: 3, pn: page, ps: Math.min(pageSize, 20), sort },
      {
        includeAuth: true,
        appendBuvid: true,
        referer: `https://www.bilibili.com/video/${bvid}/`,
      },
    );
  }
}

export async function getDanmakuXml(cid: number): Promise<string> {
  const url = `${config.commentBaseUrl}/${cid}.xml`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": config.userAgent,
      Referer: config.referer,
    },
  });

  if (!response.ok) {
    throw new NetworkError(
      `弹幕请求失败：HTTP ${response.status}`,
      undefined,
      url,
      response.status,
    );
  }
  return response.text();
}
