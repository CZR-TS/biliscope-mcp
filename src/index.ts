// MCP 服务器入口
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 使用绝对路径加载.env文件（如果存在）
const envPath = resolve(__dirname, "../.env");
try {
  config({ path: envPath });
} catch (e) {
  // .env is optional
}

import { server } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Smithery expects a default export returning the Server instance
export default function createServer() {
  return server;
}

// 启动服务器
async function main() {
  console.error("本工具仅供技术研究使用，请确保您的访问行为符合平台规范");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bilibili MCP server running on stdio");
}

// 只有在直接运行时才启动 stdio (防止在 Smithery 扫描阶段冲突)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
