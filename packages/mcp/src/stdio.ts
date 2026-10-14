#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPlinthMcpServer } from "./index";

const apiUrl = process.env.PLINTH_API_URL;
const apiKey = process.env.PLINTH_API_KEY;
if (!apiUrl || !apiKey) {
  console.error("Set PLINTH_API_URL and PLINTH_API_KEY (an sk_test_ key) before starting the Plinth MCP server.");
  process.exit(1);
}
await createPlinthMcpServer({ apiUrl, apiKey }).connect(new StdioServerTransport());
