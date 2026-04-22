import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getPreferredLanguage } from "./config.js";
import {
  getHotVideoItems,
  getRelatedVideoItems,
  getResolvedVideoData,
  getVideoCommentsData,
  getVideoDanmaku,
  getVideoDetail,
  searchVideoItems,
} from "./bilibili/comments.js";
import { getVideoInfoWithSubtitle } from "./bilibili/subtitle.js";
import { credentialManager } from "./utils/credentials.js";
import {
  BilibiliAPIError,
  FieldErrorDetail,
  NetworkError,
  TimeoutError,
  ValidationError,
  formatToolError,
} from "./utils/errors.js";
import {
  validateDetailLevel,
  validateKeyword,
  validateLanguage,
  validatePositiveInteger,
  validateSupportedLanguage,
  validateVideoInput,
} from "./utils/validation.js";
import { logger } from "./utils/logger.js";

const TOOL_EXPECTATIONS: Record<string, Record<string, string>> = {
  configure_cookiecloud: {
    endpoint: "必填；CookieCloud 服务地址，例如 https://cookies.xm.mk",
    uuid: "必填；CookieCloud 用户 KEY / UUID",
    password: "必填；CookieCloud 端对端加密密码",
  },
  search_videos: {
    keyword: "必填；搜索关键词",
    page: "可选；搜索结果页码，默认 1",
    page_size: "可选；每页数量，默认 10，最大 20",
  },
  resolve_video: {
    input: "必填；BV/AV/视频链接/关键词",
    page: "可选；视频分P序号，默认 1",
  },
  get_video_detail: {
    input: "必填；BV/AV/视频链接/关键词",
    page: "可选；视频分P序号，默认 1",
  },
  get_video_subtitles: {
    input: "必填；BV/AV/视频链接/关键词",
    preferred_lang: "可选；字幕语言，如 zh-Hans、zh-CN、en",
    page: "可选；视频分P序号，默认 1",
  },
  get_video_comments: {
    input: "必填；BV/AV/视频链接/关键词",
    detail_level: '可选；"brief" 或 "detailed"，默认 "brief"',
  },
  get_video_danmaku: {
    input: "必填；BV/AV/视频链接/关键词",
    limit: "可选；最大返回条数，默认 100，最大 200",
    page: "可选；视频分P序号，默认 1",
  },
  get_hot_videos: {
    limit: "可选；返回数量，默认 10，最大 20",
  },
  get_related_videos: {
    input: "必填；BV/AV/视频链接/关键词",
  },
};

function shouldKeepClientReasoning(error: unknown): boolean {
  return (
    error instanceof BilibiliAPIError ||
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ValidationError
  );
}

function withToolValidation<T>(tool: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ValidationError) {
      error.tool = error.tool ?? tool;
      error.expected = error.expected ?? TOOL_EXPECTATIONS[tool];
    }
    throw error;
  }
}

function assertAllowedArgs(tool: string, args: Record<string, unknown>, allowedFields: string[]): void {
  const unknownFields = Object.keys(args).filter((key) => !allowedFields.includes(key));
  if (unknownFields.length > 0) {
    throw new ValidationError("存在未支持的参数字段。", {
      tool,
      fieldErrors: unknownFields.map((field) => ({
        field,
        message: `工具 ${tool} 不支持字段 ${field}。`,
        expected: "请移除该字段，或改用 expected 中列出的参数",
      })),
      expected: TOOL_EXPECTATIONS[tool],
    });
  }
}

function validateToolArguments(tool: string, args: Record<string, unknown>, allowedFields: string[]): void {
  assertAllowedArgs(tool, args, allowedFields);
}

function getTools() {
  return [
    {
      name: "configure_cookiecloud",
      description:
        "在当前 MCP 服务实例内配置 CookieCloud，并将配置写入项目根 .env。配置成功后，字幕和评论工具会使用这组 CookieCloud 参数。",
      inputSchema: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "CookieCloud 服务地址，例如 https://cookies.xm.mk" },
          uuid: { type: "string", description: "CookieCloud 用户 KEY / UUID" },
          password: { type: "string", description: "CookieCloud 端对端加密密码" },
        },
        required: ["endpoint", "uuid", "password"],
      },
    },
    {
      name: "search_videos",
      description:
        "按关键词搜索 B 站视频。返回标题、BV 号、链接、作者、播放量、时长、发布时间和简介。",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词" },
          page: { type: "number", description: "页码，默认 1" },
          page_size: { type: "number", description: "每页返回数，默认 10，最大 20" },
        },
        required: ["keyword"],
      },
    },
    {
      name: "resolve_video",
      description:
        "输入关键词、BV 号、AV 号或链接，解析成标准视频对象，并支持指定分P。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "关键词、BV/AV 号或视频链接" },
          page: { type: "number", description: "分P序号，默认 1" },
        },
        required: ["input"],
      },
    },
    {
      name: "get_video_detail",
      description:
        "获取视频详情。返回标题、简介、封面、作者、统计、标签、分P列表和发布时间，并标明当前分P。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号、AV 号、链接或关键词" },
          page: { type: "number", description: "分P序号，默认 1" },
        },
        required: ["input"],
      },
    },
    {
      name: "get_video_subtitles",
      description:
        "获取视频字幕。默认返回一种语言，并支持通过 page 指定分P，通过 preferred_lang 指定语言。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号、AV 号、链接或关键词" },
          preferred_lang: { type: "string", description: "字幕语言偏好，例如 zh-Hans、en" },
          page: { type: "number", description: "分P序号，默认 1" },
        },
        required: ["input"],
      },
    },
    {
      name: "get_video_comments",
      description:
        "获取视频热门评论。brief 返回较短结果，detailed 返回更多评论和部分高赞回复。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号、AV 号、链接或关键词" },
          detail_level: {
            type: "string",
            enum: ["brief", "detailed"],
            description: "评论返回粒度，默认 brief",
          },
        },
        required: ["input"],
      },
    },
    {
      name: "get_video_danmaku",
      description:
        "获取视频弹幕。默认返回前 100 条，支持通过 page 指定分P。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号、AV 号、链接或关键词" },
          limit: { type: "number", description: "最大返回条数，默认 100，最大 200" },
          page: { type: "number", description: "分P序号，默认 1" },
        },
        required: ["input"],
      },
    },
    {
      name: "get_hot_videos",
      description: "获取当前热门视频列表。",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "返回数量，默认 10，最大 20" },
        },
      },
    },
    {
      name: "get_related_videos",
      description: "获取视频相关推荐列表。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号、AV 号、链接或关键词" },
        },
        required: ["input"],
      },
    },
  ];
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "configure_cookiecloud": {
      validateToolArguments(name, args, ["endpoint", "uuid", "password"]);
      const endpoint = String(args.endpoint ?? "").trim();
      const uuid = String(args.uuid ?? "").trim();
      const password = String(args.password ?? "");

      if (!endpoint || !uuid || !password) {
        const fieldErrors: FieldErrorDetail[] = [];
        if (!endpoint) {
          fieldErrors.push({
            field: "endpoint",
            message: "缺少 CookieCloud 服务地址。",
            expected: "例如 https://cookies.xm.mk",
          });
        }
        if (!uuid) {
          fieldErrors.push({
            field: "uuid",
            message: "缺少 CookieCloud 用户 KEY / UUID。",
            expected: "请填写插件中的 UUID",
          });
        }
        if (!password) {
          fieldErrors.push({
            field: "password",
            message: "缺少 CookieCloud 端对端加密密码。",
            expected: "请填写插件中的加密密码",
          });
        }

        throw new ValidationError("CookieCloud 配置参数不完整。", {
          tool: name,
          fieldErrors,
          expected: TOOL_EXPECTATIONS[name],
        });
      }

      if (!/^https?:\/\//i.test(endpoint)) {
        throw new ValidationError("endpoint 格式不正确。", {
          tool: name,
          fieldErrors: [
            {
              field: "endpoint",
              message: "CookieCloud 地址必须以 http:// 或 https:// 开头。",
              received: endpoint,
              expected: "例如 https://cookies.xm.mk",
            },
          ],
          expected: TOOL_EXPECTATIONS[name],
        });
      }

      const envPath = await credentialManager.configureCookieCloud({ endpoint, uuid, password });
      return {
        ok: true,
        cookie_source: "cookiecloud",
        endpoint,
        uuid_tail: uuid.slice(-6),
        persisted: true,
        env_path: envPath,
        message: "CookieCloud 配置成功，已写入项目根 .env，并完成拉取与解密验证。",
      };
    }
    case "search_videos": {
      validateToolArguments(name, args, ["keyword", "page", "page_size"]);
      const keyword = String(args.keyword ?? "");
      const page = Number(args.page ?? 1);
      const pageSize = Number(args.page_size ?? 10);
      return withToolValidation(name, () => {
        validateKeyword(keyword);
        validatePositiveInteger(page, "page");
        validatePositiveInteger(pageSize, "page_size");
        return searchVideoItems(keyword, page, Math.min(pageSize, 20));
      });
    }
    case "resolve_video": {
      validateToolArguments(name, args, ["input", "page"]);
      const input = String(args.input ?? "");
      const page = Number(args.page ?? 1);
      withToolValidation(name, () => {
        validateVideoInput(input);
        validatePositiveInteger(page, "page");
      });
      return getResolvedVideoData(input, page);
    }
    case "get_video_detail": {
      validateToolArguments(name, args, ["input", "page"]);
      const input = String(args.input ?? "");
      const page = Number(args.page ?? 1);
      withToolValidation(name, () => {
        validateVideoInput(input);
        validatePositiveInteger(page, "page");
      });
      return getVideoDetail(input, page);
    }
    case "get_video_subtitles": {
      validateToolArguments(name, args, ["input", "preferred_lang", "page"]);
      const input = String(args.input ?? "");
      const preferredLang = args.preferred_lang ? String(args.preferred_lang) : undefined;
      const page = Number(args.page ?? 1);
      withToolValidation(name, () => {
        validateVideoInput(input);
        validatePositiveInteger(page, "page");
        validateLanguage(preferredLang);
        validateSupportedLanguage(preferredLang);
      });
      return getVideoInfoWithSubtitle(
        input,
        preferredLang ? getPreferredLanguage(preferredLang) : undefined,
        page,
      );
    }
    case "get_video_comments": {
      validateToolArguments(name, args, ["input", "detail_level"]);
      const input = String(args.input ?? "");
      const detailLevel = String(args.detail_level ?? "brief") as "brief" | "detailed";
      return withToolValidation(name, () => {
        validateVideoInput(input);
        validateDetailLevel(detailLevel);
        return getVideoCommentsData(input, detailLevel);
      });
    }
    case "get_video_danmaku": {
      validateToolArguments(name, args, ["input", "limit", "page"]);
      const input = String(args.input ?? "");
      const limit = Number(args.limit ?? 100);
      const page = Number(args.page ?? 1);
      withToolValidation(name, () => {
        validateVideoInput(input);
        validatePositiveInteger(limit, "limit");
        validatePositiveInteger(page, "page");
      });
      return getVideoDanmaku(input, Math.min(limit, 200), page);
    }
    case "get_hot_videos": {
      validateToolArguments(name, args, ["limit"]);
      const limit = Number(args.limit ?? 10);
      return withToolValidation(name, () => {
        validatePositiveInteger(limit, "limit");
        return getHotVideoItems(Math.min(limit, 20));
      });
    }
    case "get_related_videos": {
      validateToolArguments(name, args, ["input"]);
      const input = String(args.input ?? "");
      return withToolValidation(name, () => {
        validateVideoInput(input);
        return getRelatedVideoItems(input);
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function createServer(): Server {
  const server = new Server(
    {
      name: "biliscope-mcp-server",
      version: "2.1.9",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const startedAt = Date.now();

    try {
      const result = await callTool(name, args as Record<string, unknown>);
      logger.logToolResult(name, true, Date.now() - startedAt);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.logToolResult(
        name,
        false,
        Date.now() - startedAt,
        error instanceof Error ? error.message : String(error),
      );

      if (error instanceof ValidationError) {
        error.tool = error.tool ?? name;
        error.expected = error.expected ?? TOOL_EXPECTATIONS[name];
      }

      const formatted = formatToolError(error);
      return {
        content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
        isError: !shouldKeepClientReasoning(error),
      };
    }
  });

  return server;
}

export const server = createServer();
