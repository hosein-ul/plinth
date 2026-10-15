import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPlinthMcpServer, type PlinthMcpOptions } from "./index";

/**
 * Serve one MCP request over Streamable HTTP, statelessly: a fresh server is built for the request with the caller's own API key, so
 * nothing is shared between callers and nothing is stored. `opts.apiKey` must be the caller's key (taken from its Authorization header).
 */
export async function handleMcpHttp(req: IncomingMessage, res: ServerResponse, body: unknown, opts: PlinthMcpOptions): Promise<void> {
  const server = createPlinthMcpServer(opts);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
