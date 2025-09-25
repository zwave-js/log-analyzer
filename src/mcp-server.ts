#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZWaveLogMCPServerCore } from "./lib/zwave-mcp-server-core.js";

async function main() {
	const serverCore = new ZWaveLogMCPServerCore();
	const server = serverCore.getServer();

	server.onerror = (error) => console.error("[MCP Error]", error);
	process.on("SIGINT", async () => {
		await server.close();
		process.exit(0);
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
