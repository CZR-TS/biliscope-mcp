export interface Config {
  rateLimitMs: number;
  wbiCacheExpirationMs: number;
  requestTimeoutMs: number;
  maxCacheSize: number;
  supportedLanguages: string[];
  baseUrl: string;
  commentBaseUrl: string;
  userAgent: string;
  referer: string;
  cookieSource: "cookiecloud";
  cookieCloudEndpoint: string;
  cookieCloudUuid: string;
  cookieCloudPassword: string;
  cookieCloudDomains: string[];
  cookieRefreshIntervalMinutes: number;
  transportMode: "stdio" | "http";
  httpHost: string;
  httpPort: number;
  httpMcpPath: string;
  httpSsePath: string;
  httpMessagesPath: string;
}

export const DEFAULT_CONFIG: Omit<
  Config,
  "cookieCloudEndpoint" | "cookieCloudUuid" | "cookieCloudPassword"
> = {
  rateLimitMs: 500,
  wbiCacheExpirationMs: 60 * 60 * 1000,
  requestTimeoutMs: 10000,
  maxCacheSize: 100,
  supportedLanguages: ["zh-Hans", "zh-CN", "zh-Hant", "en", "ja", "ko"],
  baseUrl: "https://api.bilibili.com",
  commentBaseUrl: "https://comment.bilibili.com",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  referer: "https://www.bilibili.com",
  cookieSource: "cookiecloud",
  cookieCloudDomains: ["bilibili.com", ".bilibili.com", "www.bilibili.com"],
  cookieRefreshIntervalMinutes: 10,
  transportMode: "http",
  httpHost: "0.0.0.0",
  httpPort: 3000,
  httpMcpPath: "/mcp",
  httpSsePath: "/sse",
  httpMessagesPath: "/messages",
};

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDomainKeywords(value: string | undefined): string[] {
  if (!value) return [...DEFAULT_CONFIG.cookieCloudDomains];
  const domains = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return domains.length > 0 ? domains : [...DEFAULT_CONFIG.cookieCloudDomains];
}

function parseTransportMode(value: string | undefined): "stdio" | "http" {
  if (value === "stdio") return "stdio";
  return "http";
}

export const config: Config = {
  ...DEFAULT_CONFIG,
  requestTimeoutMs: parseIntEnv(
    process.env.BILIBILI_REQUEST_TIMEOUT_MS,
    DEFAULT_CONFIG.requestTimeoutMs,
  ),
  rateLimitMs: parseIntEnv(
    process.env.BILIBILI_RATE_LIMIT_MS,
    DEFAULT_CONFIG.rateLimitMs,
  ),
  maxCacheSize: parseIntEnv(
    process.env.BILIBILI_CACHE_SIZE,
    DEFAULT_CONFIG.maxCacheSize,
  ),
  userAgent: process.env.USER_AGENT || DEFAULT_CONFIG.userAgent,
  cookieSource: "cookiecloud",
  cookieCloudEndpoint: process.env.COOKIECLOUD_ENDPOINT || "",
  cookieCloudUuid: process.env.COOKIECLOUD_UUID || "",
  cookieCloudPassword: process.env.COOKIECLOUD_PASSWORD || "",
  cookieCloudDomains: parseDomainKeywords(process.env.COOKIECLOUD_DOMAINS),
  cookieRefreshIntervalMinutes: parseIntEnv(
    process.env.COOKIE_REFRESH_INTERVAL_MINUTES,
    DEFAULT_CONFIG.cookieRefreshIntervalMinutes,
  ),
  transportMode: parseTransportMode(process.env.BILISCOPE_TRANSPORT),
  httpHost: process.env.BILISCOPE_HTTP_HOST || process.env.HOST || DEFAULT_CONFIG.httpHost,
  httpPort: parseIntEnv(process.env.BILISCOPE_HTTP_PORT || process.env.PORT, DEFAULT_CONFIG.httpPort),
  httpMcpPath: process.env.BILISCOPE_HTTP_MCP_PATH || DEFAULT_CONFIG.httpMcpPath,
  httpSsePath: process.env.BILISCOPE_HTTP_SSE_PATH || DEFAULT_CONFIG.httpSsePath,
  httpMessagesPath:
    process.env.BILISCOPE_HTTP_MESSAGES_PATH || DEFAULT_CONFIG.httpMessagesPath,
};

export function validateRuntimeConfig(): void {
  const source = process.env.BILIBILI_COOKIE_SOURCE;
  if (source && source !== "cookiecloud") {
    throw new Error(
      'BILIBILI_COOKIE_SOURCE 仅支持 "cookiecloud"，当前项目已移除手动 Cookie 模式。',
    );
  }

  const missing: string[] = [];
  if (!config.cookieCloudEndpoint) missing.push("COOKIECLOUD_ENDPOINT");
  if (!config.cookieCloudUuid) missing.push("COOKIECLOUD_UUID");
  if (!config.cookieCloudPassword) missing.push("COOKIECLOUD_PASSWORD");

  if (missing.length > 0) {
    throw new Error(
      `CookieCloud 配置缺失：${missing.join(", ")}。部署时请只通过 env 提供 CookieCloud 参数。`,
    );
  }
}

export function isValidLanguage(lang: string): boolean {
  return config.supportedLanguages.includes(lang);
}

export function getPreferredLanguage(preferredLang?: string): string {
  if (preferredLang && isValidLanguage(preferredLang)) {
    return preferredLang;
  }
  return config.supportedLanguages[0];
}
