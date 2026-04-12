#!/usr/bin/env node

import fs from "fs";
import { program } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server.js";
import { credentialManager } from "./utils/credentials.js";
import { config } from "./config.js";
import { startHttpServer } from "./http-server.js";

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

async function startStdioServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BiliScope MCP started with stdio transport");
  console.error("CookieCloud will be checked lazily when an authenticated tool is called");
}

async function startHttpMode() {
  await startHttpServer({
    host: config.httpHost,
    port: config.httpPort,
    mcpPath: config.httpMcpPath,
    ssePath: config.httpSsePath,
    messagesPath: config.httpMessagesPath,
  });
}

async function startDefaultServer() {
  if (config.transportMode === "http") {
    await startHttpMode();
    return;
  }
  await startStdioServer();
}

async function checkConfig() {
  try {
    await credentialManager.initialize();
    const status = credentialManager.getStatus();
    console.log("配置状态：可用");
    console.log(`Cookie 来源：${status.source}`);
    console.log(`CookieCloud 地址：${status.endpoint}`);
    console.log(`刷新间隔：${status.refreshIntervalMinutes} 分钟`);
    console.log(
      `最近刷新：${status.refreshedAt ? new Date(status.refreshedAt).toISOString() : "尚未拉取"}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function showHelp() {
  console.log(`biliscope-mcp ${packageJson.version}`);
  console.log("");
  console.log("BiliScope MCP - CookieCloud 自动登录版");
  console.log("");
  console.log("用法：");
  console.log("  biliscope-mcp         启动 MCP 服务；默认 Streamable HTTP");
  console.log("  biliscope-mcp stdio   启动 stdio 服务，适合 ModelScope 托管检测");
  console.log("  biliscope-mcp http    启动 Streamable HTTP/SSE 服务");
  console.log("  biliscope-mcp check   检查 CookieCloud 配置");
  console.log("  biliscope-mcp help    显示帮助");
  console.log("");
  console.log("说明：");
  console.log("  仅支持 CookieCloud，不再支持本地手动 Cookie。");
  console.log("  启动和 list_tools 不预拉 CookieCloud，调用需要登录态的工具时才校验。");
  console.log("  ModelScope 托管部署推荐使用：npx -y biliscope-mcp@latest stdio。");
  console.log("  自己部署公网服务时推荐使用 Streamable HTTP。");
  console.log("  Streamable HTTP 默认端点：/mcp。");
  console.log("  兼容 SSE 默认端点：/sse，消息端点：/messages。");
}

async function main() {
  program.name("biliscope-mcp").version(packageJson.version).description("BiliScope MCP");

  program.arguments("[command]").action(async (command) => {
    switch (command) {
      case "stdio":
        await startStdioServer();
        break;
      case "http":
        await startHttpMode();
        break;
      case "check":
        checkConfig();
        break;
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;
      case "version":
      case "--version":
      case "-v":
        console.log(packageJson.version);
        break;
      case undefined:
        await startDefaultServer();
        break;
      default:
        console.error(`未知命令：${command}`);
        showHelp();
        process.exit(1);
    }
  });

  program.command("stdio").description("启动 stdio MCP 服务").action(startStdioServer);
  program.command("http").description("启动 Streamable HTTP/SSE 服务").action(startHttpMode);
  program.command("check").description("检查 CookieCloud 配置").action(checkConfig);
  program.command("help").description("显示帮助").action(showHelp);

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
