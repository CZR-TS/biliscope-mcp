export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
    public url?: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string, public timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class BilibiliAPIError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public originalError?: unknown,
    public retryable: boolean = false,
    public suggestion?: string,
  ) {
    super(message);
    this.name = "BilibiliAPIError";
  }
}

export class CommentsDisabledError extends Error {
  constructor(message: string = "该视频的评论功能已关闭或当前不可访问。") {
    super(message);
    this.name = "CommentsDisabledError";
  }
}

export function handleValidationError(error: unknown): never {
  if (error instanceof ValidationError) {
    throw error;
  }
  if (error instanceof Error) {
    throw new ValidationError(error.message);
  }
  throw new ValidationError("输入校验失败。");
}

export function formatToolError(error: unknown): {
  error: true;
  code: string;
  message: string;
  retryable: boolean;
  cookie_source: "cookiecloud";
  suggestion: string;
} {
  if (error instanceof BilibiliAPIError) {
    return {
      error: true,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      cookie_source: "cookiecloud",
      suggestion: error.suggestion || "请检查 CookieCloud 配置和 B 站登录状态。",
    };
  }

  if (error instanceof ValidationError) {
    return {
      error: true,
      code: "VALIDATION_ERROR",
      message: error.message,
      retryable: false,
      cookie_source: "cookiecloud",
      suggestion: "请检查工具入参格式。",
    };
  }

  if (error instanceof TimeoutError) {
    return {
      error: true,
      code: "REQUEST_TIMEOUT",
      message: error.message,
      retryable: true,
      cookie_source: "cookiecloud",
      suggestion: "稍后重试，或提高请求超时时间。",
    };
  }

  if (error instanceof NetworkError) {
    return {
      error: true,
      code: "NETWORK_ERROR",
      message: error.message,
      retryable: true,
      cookie_source: "cookiecloud",
      suggestion: "请检查网络连通性、代理或 CookieCloud 地址。",
    };
  }

  return {
    error: true,
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "未知错误",
    retryable: false,
    cookie_source: "cookiecloud",
    suggestion: "请查看 stderr 日志定位问题。",
  };
}
