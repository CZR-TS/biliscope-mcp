import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "test",
  version: "1"
});

server.tool(
  "dummy_tool",
  { input: z.string() },
  async ({ input }) => ({
    content: [{ type: "text", text: `Dummy ${input}` }]
  })
);

export default server;
