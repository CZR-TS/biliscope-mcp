#!/usr/bin/env node

import fs from "fs";
import { program } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server.js";
import { credentialManager } from "./utils/credentials.js";
import { validateRuntimeConfig } from "./config.js";

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

async function startServer() {
  validateRuntimeConfig();
  await credentialManager.initialize();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BiliScope MCP started with CookieCloud authentication");
}

function checkConfig() {
  try {
    validateRuntimeConfig();
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
  console.log("  biliscope-mcp         启动 MCP 服务");
  console.log("  biliscope-mcp check   检查 CookieCloud 配置");
  console.log("  biliscope-mcp help    显示帮助");
  console.log("");
  console.log("说明：");
  console.log("  仅支持 CookieCloud，不再支持本地手动 Cookie。");
  console.log("  部署时请通过 env 提供 COOKIECLOUD_ENDPOINT / UUID / PASSWORD。");
}

async function main() {
  program.name("biliscope-mcp").version(packageJson.version).description("BiliScope MCP");

  program
    .arguments("[command]")
    .action(async (command) => {
      switch (command) {
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
          await startServer();
          break;
        default:
          console.error(`未知命令：${command}`);
          showHelp();
          process.exit(1);
      }
    });

  program.command("check").description("检查 CookieCloud 配置").action(checkConfig);
  program.command("help").description("显示帮助").action(showHelp);

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
