import { config } from "../config.js";
import { BilibiliAPIError, NetworkError, TimeoutError } from "./errors.js";

const BV_PATTERN = /BV[A-Za-z0-9]{10}/;
const BILIBILI_SHORT_HOSTS = new Set(["b23.tv", "bili2233.cn"]);
const BILIBILI_VIDEO_HOSTS = new Set([
  "bilibili.com",
  "www.bilibili.com",
  "m.bilibili.com",
]);
const URL_PATTERN = /https?:\/\/[^\s<>"']+|(?:b23\.tv|bili2233\.cn)\/[^\s<>"']+/i;

export function extractBVId(input: string): string {
  if (!input) {
    throw new Error("Input cannot be empty");
  }

  const match = input.match(BV_PATTERN);
  if (match) {
    return match[0];
  }

  throw new Error("Invalid Bilibili video ID or URL");
}

export function isValidBVId(bvid: string): boolean {
  if (!bvid) {
    return false;
  }
  return /^BV[A-Za-z0-9]{10}$/.test(bvid);
}

export function validateBVId(bvid: string): void {
  if (!bvid) {
    throw new Error("BV ID cannot be empty");
  }

  if (bvid.length !== 12) {
    throw new Error(`Invalid BV ID length: expected 12 characters, got ${bvid.length}`);
  }

  if (!isValidBVId(bvid)) {
    throw new Error("Invalid BV ID format");
  }
}

export function normalizeBVId(input: string): string {
  const bvid = extractBVId(input.trim());
  return bvid.toUpperCase();
}

export function createVideoUrl(bvid: string): string {
  const normalizedBvid = normalizeBVId(bvid);
  return `https://www.bilibili.com/video/${normalizedBvid}`;
}

export function containsBVId(input: string): boolean {
  if (!input) {
    return false;
  }
  return BV_PATTERN.test(input);
}

function extractUrlCandidate(input: string): string | null {
  const match = input.match(URL_PATTERN);
  if (!match) {
    return null;
  }

  const candidate = match[0].replace(/[)\]}>，。！？、]+$/u, "");
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  return `https://${candidate}`;
}

function isAllowedBilibiliHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return BILIBILI_SHORT_HOSTS.has(normalized) || BILIBILI_VIDEO_HOSTS.has(normalized);
}

function isShortHost(hostname: string): boolean {
  return BILIBILI_SHORT_HOSTS.has(hostname.toLowerCase());
}

async function fetchRedirectedUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": config.userAgent,
        Referer: config.referer,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok && response.status >= 400) {
      throw new NetworkError(
        `Short link request failed: HTTP ${response.status}`,
        undefined,
        url,
        response.status,
      );
    }

    return response.url || url;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutError("Short link resolution timed out.", config.requestTimeoutMs);
    }
    if (error instanceof NetworkError || error instanceof TimeoutError) {
      throw error;
    }
    throw new NetworkError(
      "Short link request failed.",
      error instanceof Error ? error : undefined,
      url,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveBilibiliVideoInput(input: string): Promise<string> {
  const cleaned = input.trim();
  if (!cleaned) {
    throw new Error("Input cannot be empty");
  }

  if (containsBVId(cleaned)) {
    return cleaned;
  }

  const urlCandidate = extractUrlCandidate(cleaned);
  if (!urlCandidate) {
    return cleaned;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlCandidate);
  } catch {
    return cleaned;
  }

  if (!isAllowedBilibiliHost(parsed.hostname)) {
    return cleaned;
  }

  if (!isShortHost(parsed.hostname)) {
    return urlCandidate;
  }

  const redirectedUrl = await fetchRedirectedUrl(urlCandidate);
  if (containsBVId(redirectedUrl)) {
    return redirectedUrl;
  }

  throw new BilibiliAPIError(
    "Bilibili short link did not resolve to a video BV URL.",
    "VIDEO_LINK_RESOLVE_FAILED",
    undefined,
    { input, redirected_url: redirectedUrl },
    true,
    "Please confirm the short link points to a public Bilibili video page.",
  );
}
