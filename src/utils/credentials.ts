import { createDecipheriv, createHash } from "crypto";
import { config } from "../config.js";
import { BilibiliAPIError, NetworkError } from "./errors.js";
import { logger } from "./logger.js";

export interface CookieCloudCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  hostOnly?: boolean;
}

export interface BilibiliCredentials {
  cookieHeader: string;
  cookies: CookieCloudCookie[];
  refreshAt: number;
  refreshedAt: number;
}

function md5Hex(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function evpBytesToKey(password: Buffer, salt: Buffer, keyLen: number, ivLen: number) {
  const buffers: Buffer[] = [];
  let previous = Buffer.alloc(0);

  while (Buffer.concat(buffers).length < keyLen + ivLen) {
    const hash = createHash("md5");
    hash.update(previous);
    hash.update(password);
    hash.update(salt);
    previous = hash.digest();
    buffers.push(previous);
  }

  const material = Buffer.concat(buffers);
  return {
    key: material.subarray(0, keyLen),
    iv: material.subarray(keyLen, keyLen + ivLen),
  };
}

function decryptCryptoJSAes(encrypted: string, passphrase: string): string {
  const raw = Buffer.from(encrypted, "base64");
  if (raw.subarray(0, 8).toString("utf8") !== "Salted__") {
    throw new Error("CookieCloud 密文格式不正确。");
  }

  const salt = raw.subarray(8, 16);
  const ciphertext = raw.subarray(16);
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, "utf8"), salt, 32, 16);

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

function matchesDomainKeyword(domain: string | undefined, keywords: string[]): boolean {
  const normalized = (domain || "").toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function normalizeCookieEntries(rawCookieData: unknown): CookieCloudCookie[] {
  if (Array.isArray(rawCookieData)) {
    return rawCookieData.filter(Boolean) as CookieCloudCookie[];
  }

  if (rawCookieData && typeof rawCookieData === "object") {
    return Object.values(rawCookieData as Record<string, unknown>).flatMap((item) =>
      normalizeCookieEntries(item),
    );
  }

  return [];
}

function buildCookieHeader(cookies: CookieCloudCookie[]): string {
  const deduped = new Map<string, string>();
  for (const cookie of cookies) {
    if (cookie.name && typeof cookie.value === "string") {
      deduped.set(cookie.name, cookie.value);
    }
  }

  return [...deduped.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function ensureRequiredBilibiliCookies(header: string): void {
  const required = ["SESSDATA=", "bili_jct=", "DedeUserID="];
  const missing = required.filter((item) => !header.includes(item));
  if (missing.length > 0) {
    throw new BilibiliAPIError(
      `CookieCloud 返回的 B 站 Cookie 不完整，缺少 ${missing.join(", ")}。`,
      "BILIBILI_COOKIE_INVALID",
      undefined,
      undefined,
      false,
      "请确认浏览器已登录 B 站，并且 CookieCloud 同步域名包含 bilibili.com。",
    );
  }
}

function extractEncryptedPayload(payload: any): string {
  if (typeof payload?.encrypted === "string") {
    return payload.encrypted;
  }
  if (typeof payload?.data?.encrypted === "string") {
    return payload.data.encrypted;
  }
  if (typeof payload === "string") {
    return payload;
  }

  throw new BilibiliAPIError(
    "CookieCloud 返回内容中缺少 encrypted 字段。",
    "COOKIECLOUD_FETCH_FAILED",
    undefined,
    payload,
    true,
    "请检查 CookieCloud 服务是否兼容官方接口。",
  );
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
}

function ensureCookieCloudConfig(): void {
  const source = process.env.BILIBILI_COOKIE_SOURCE;
  if (source && source !== "cookiecloud") {
    throw new BilibiliAPIError(
      'BILIBILI_COOKIE_SOURCE 仅支持 "cookiecloud"，当前项目已移除手动 Cookie 模式。',
      "COOKIECLOUD_CONFIG_INVALID",
      undefined,
      undefined,
      false,
      "请删除手动 Cookie 相关配置，只保留 CookieCloud 参数。",
    );
  }

  const missing: string[] = [];
  if (!config.cookieCloudEndpoint) missing.push("COOKIECLOUD_ENDPOINT");
  if (!config.cookieCloudUuid) missing.push("COOKIECLOUD_UUID");
  if (!config.cookieCloudPassword) missing.push("COOKIECLOUD_PASSWORD");

  if (missing.length > 0) {
    throw new BilibiliAPIError(
      `CookieCloud 配置缺失：${missing.join(", ")}。`,
      "COOKIECLOUD_CONFIG_INVALID",
      undefined,
      undefined,
      false,
      "请在部署 JSON 的 env 中提供 COOKIECLOUD_ENDPOINT、COOKIECLOUD_UUID、COOKIECLOUD_PASSWORD。",
    );
  }
}

export class CredentialManager {
  private static instance: CredentialManager;
  private credentials: BilibiliCredentials | null = null;
  private refreshPromise: Promise<BilibiliCredentials> | null = null;

  static getInstance(): CredentialManager {
    if (!CredentialManager.instance) {
      CredentialManager.instance = new CredentialManager();
    }
    return CredentialManager.instance;
  }

  async initialize(): Promise<void> {
    ensureCookieCloudConfig();
    await this.refreshCredentials(true);
  }

  getStatus() {
    return {
      source: "cookiecloud" as const,
      endpoint: config.cookieCloudEndpoint,
      refreshIntervalMinutes: config.cookieRefreshIntervalMinutes,
      refreshedAt: this.credentials?.refreshedAt ?? null,
      hasCredentials: Boolean(this.credentials?.cookieHeader),
    };
  }

  private shouldRefresh(): boolean {
    if (!this.credentials) {
      return true;
    }
    return Date.now() >= this.credentials.refreshAt;
  }

  async getAuthHeaders(forceRefresh: boolean = false): Promise<Record<string, string>> {
    if (forceRefresh || this.shouldRefresh()) {
      await this.refreshCredentials(forceRefresh);
    }

    if (!this.credentials) {
      throw new BilibiliAPIError(
        "当前没有可用的 B 站 Cookie。",
        "BILIBILI_COOKIE_INVALID",
        undefined,
        undefined,
        false,
        "请检查 CookieCloud 是否已同步到最新的 B 站登录态。",
      );
    }

    return { Cookie: this.credentials.cookieHeader };
  }

  async refreshCredentials(force: boolean = false): Promise<BilibiliCredentials> {
    ensureCookieCloudConfig();

    if (!force && !this.shouldRefresh() && this.credentials) {
      return this.credentials;
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchFromCookieCloud()
      .then((credentials) => {
        this.credentials = credentials;
        return credentials;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  async markAuthFailureAndRefresh(): Promise<void> {
    await this.refreshCredentials(true);
  }

  private async fetchFromCookieCloud(): Promise<BilibiliCredentials> {
    const endpoint = new URL(
      `get/${encodeURIComponent(config.cookieCloudUuid)}`,
      normalizeEndpoint(config.cookieCloudEndpoint),
    ).toString();

    logger.info("Fetching credentials from CookieCloud", {
      endpoint,
      domains: config.cookieCloudDomains,
    });

    let response: Response;
    try {
      response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    } catch (error) {
      throw new NetworkError(
        "无法连接 CookieCloud 服务。",
        error instanceof Error ? error : undefined,
        endpoint,
      );
    }

    if (!response.ok) {
      throw new BilibiliAPIError(
        `CookieCloud 请求失败，HTTP ${response.status}。`,
        "COOKIECLOUD_FETCH_FAILED",
        response.status,
        undefined,
        true,
        "请检查 CookieCloud 服务地址、反代配置或访问权限。",
      );
    }

    const payload = await response.json();
    const encrypted = extractEncryptedPayload(payload);

    let decryptedText: string;
    try {
      const passphrase = md5Hex(
        `${config.cookieCloudUuid}-${config.cookieCloudPassword}`,
      ).substring(0, 16);
      decryptedText = decryptCryptoJSAes(encrypted, passphrase);
    } catch (error) {
      throw new BilibiliAPIError(
        "CookieCloud 解密失败，请检查 UUID 或密码是否正确。",
        "COOKIECLOUD_DECRYPT_FAILED",
        undefined,
        error,
        false,
        "请确认使用的是浏览器插件中的“用户KEY·UUID”和“端对端加密密码”。",
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(decryptedText);
    } catch (error) {
      throw new BilibiliAPIError(
        "CookieCloud 解密成功，但返回内容不是有效 JSON。",
        "COOKIECLOUD_DECRYPT_FAILED",
        undefined,
        error,
        false,
        "请检查 CookieCloud 服务是否被额外包装或篡改。",
      );
    }

    const normalizedCookies = normalizeCookieEntries(parsed?.cookie_data ?? parsed).filter(
      (cookie) => matchesDomainKeyword(cookie.domain, config.cookieCloudDomains),
    );

    const cookieHeader = buildCookieHeader(normalizedCookies);
    ensureRequiredBilibiliCookies(cookieHeader);

    const now = Date.now();
    return {
      cookies: normalizedCookies,
      cookieHeader,
      refreshedAt: now,
      refreshAt: now + config.cookieRefreshIntervalMinutes * 60 * 1000,
    };
  }
}

export const credentialManager = CredentialManager.getInstance();
