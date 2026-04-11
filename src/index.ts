import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server.js";
import { credentialManager } from "./utils/credentials.js";
import { validateRuntimeConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  loadDotenv({ path: resolve(__dirname, "../.env") });
} catch {
  // optional
}

export default server;

async function main() {
  validateRuntimeConfig();
  await credentialManager.initialize();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BiliScope MCP started with CookieCloud authentication");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
