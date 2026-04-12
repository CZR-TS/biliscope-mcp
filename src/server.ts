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
  validateVideoInput,
} from "./utils/validation.js";
import { logger } from "./utils/logger.js";

function shouldKeepClientReasoning(error: unknown): boolean {
  return (
    error instanceof BilibiliAPIError ||
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ValidationError
  );
}

function getTools() {
  return [
    {
      name: "configure_cookiecloud",
      description:
        "在当前 MCP 服务实例内配置 CookieCloud。仅当部署平台没有正确注入环境变量时使用；配置只保存在内存，不落盘。配置成功后，字幕和评论工具会使用这组 CookieCloud 参数。",
      inputSchema: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "CookieCloud 服务器地址，例如 https://cookies.xm.mk" },
          uuid: { type: "string", description: "CookieCloud 用户 KEY / UUID" },
          password: { type: "string", description: "CookieCloud 端对端加密密码" },
        },
        required: ["endpoint", "uuid", "password"],
      },
    },
    {
      name: "search_videos",
      description:
        "按关键词搜索 B 站视频。返回标题、BV 号、链接、作者、播放量、时长、发布时间和简介，适合先搜索再决定进一步调用哪个视频工具。",
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
        "输入关键词、BV 号、AV 号或链接，解析成标准视频对象。适合在不确定视频标识格式时做统一解析。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "关键词、BV/AV 号或视频链接" },
        },
        required: ["input"],
      },
    },
    {
      name: "get_video_detail",
      description:
        "获取视频详情。返回标题、简介、封面、作者、统计、标签、分P列表和发布时间，适合做内容卡片或后续分析前的元数据读取。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号、AV 号、链接或关键词" },
        },
        required: ["input"],
      },
    },
    {
      name: "get_video_subtitles",
      description:
        "获取视频字幕，默认只返回一种语言。可通过 preferred_lang 指定语言；留空时按内置优先级自动选择：zh-Hans(人工简体中文) > ai-zh(AI 中文字幕) > zh-CN(简体中文兼容标记) > zh-Hant(繁体中文) > en(英文)。返回字幕全文、时间片段、所选语言和视频元数据；若视频无字幕则退回简介。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号、AV 号、链接或关键词" },
          preferred_lang: { type: "string", description: "字幕语言偏好，如 zh-Hans、en" },
        },
        required: ["input"],
      },
    },
    {
      name: "get_video_comments",
      description:
        "获取视频热门评论。brief 返回较短结果，适合快速看口碑；detailed 返回更多评论和部分高赞回复，适合做更深入的舆情或观点整理。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号或视频链接" },
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
        "获取视频弹幕。默认返回前 100 条，可自定义 limit；返回结果包含弹幕时间、可读时间文本和内容，并标记是否发生截断。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号、链接或关键词" },
          limit: { type: "number", description: "最大返回条数，默认 100，最大 200" },
        },
        required: ["input"],
      },
    },
    {
      name: "get_hot_videos",
      description: "获取当前热门视频列表。适合做趋势观察、推荐候选或热点发现。",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "返回数量，默认 10，最大 20" },
        },
      },
    },
    {
      name: "get_related_videos",
      description: "获取视频相关推荐列表。适合围绕某个视频继续扩展上下文或找相关内容。",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "BV 号或视频链接" },
        },
        required: ["input"],
      },
    },
  ];
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "configure_cookiecloud": {
      const endpoint = String(args.endpoint ?? "").trim();
      const uuid = String(args.uuid ?? "").trim();
      const password = String(args.password ?? "");
      if (!endpoint || !uuid || !password) {
        throw new Error("endpoint、uuid、password 都不能为空。");
      }
      credentialManager.configureCookieCloud({ endpoint, uuid, password });
      await credentialManager.initialize();
      return {
        ok: true,
        cookie_source: "cookiecloud",
        endpoint,
        uuid_tail: uuid.slice(-6),
        message: "CookieCloud 配置成功，已完成拉取和解密验证。",
      };
    }
    case "search_videos": {
      const keyword = String(args.keyword ?? "");
      const page = Number(args.page ?? 1);
      const pageSize = Number(args.page_size ?? 10);
      validateKeyword(keyword);
      validatePositiveInteger(page, "page");
      validatePositiveInteger(pageSize, "page_size");
      return searchVideoItems(keyword, page, Math.min(pageSize, 20));
    }
    case "resolve_video": {
      const input = String(args.input ?? "");
      validateVideoInput(input);
      return getResolvedVideoData(input);
    }
    case "get_video_detail": {
      const input = String(args.input ?? "");
      validateVideoInput(input);
      return getVideoDetail(input);
    }
    case "get_video_subtitles": {
      const input = String(args.input ?? "");
      const preferredLang = args.preferred_lang ? String(args.preferred_lang) : undefined;
      validateVideoInput(input);
      validateLanguage(preferredLang);
      return getVideoInfoWithSubtitle(
        input,
        preferredLang ? getPreferredLanguage(preferredLang) : undefined,
      );
    }
    case "get_video_comments": {
      const input = String(args.input ?? "");
      const detailLevel = String(args.detail_level ?? "brief") as "brief" | "detailed";
      validateVideoInput(input);
      validateDetailLevel(detailLevel);
      return getVideoCommentsData(input, detailLevel);
    }
    case "get_video_danmaku": {
      const input = String(args.input ?? "");
      const limit = Number(args.limit ?? 100);
      validateVideoInput(input);
      validatePositiveInteger(limit, "limit");
      return getVideoDanmaku(input, Math.min(limit, 200));
    }
    case "get_hot_videos": {
      const limit = Number(args.limit ?? 10);
      validatePositiveInteger(limit, "limit");
      return getHotVideoItems(Math.min(limit, 20));
    }
    case "get_related_videos": {
      const input = String(args.input ?? "");
      validateVideoInput(input);
      return getRelatedVideoItems(input);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function createServer(): Server {
  const server = new Server(
    {
      name: "biliscope-mcp-server",
      version: "2.1.7",
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
