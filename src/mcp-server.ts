#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { LogQueryEngine } from "./lib/log-query-engine.js";
import { LogTransformPipeline } from "./lib/log-processor/index.js";
import { readFile } from "node:fs/promises";

async function main() {
	let queryEngine: LogQueryEngine | null = null;
	const pipeline = new LogTransformPipeline();

	const server = new Server(
		{ name: "zwave-log-analyzer", version: "1.0.0" },
		{ capabilities: { tools: {} } },
	);

	async function initializeQueryEngine(): Promise<void> {
		if (!queryEngine) {
			throw new McpError(
				ErrorCode.InvalidRequest,
				"No log file loaded. Use the loadLogFile tool to load a log file first.",
			);
		}
	}

	async function loadLogFile(filePath: string): Promise<void> {
		const logContent = await readFile(filePath, "utf-8");
		const transformedEntries = await pipeline.processLogContent(logContent);
		queryEngine = new LogQueryEngine(transformedEntries);
	}

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: [
				{
					name: "getLogSummary",
					description:
						"Get overall statistics about the entire Z-Wave log including total entries, time range, node IDs, and network activity broken down by node",
					inputSchema: {
						type: "object",
						properties: {},
						required: [],
					},
				},
				{
					name: "getNodeSummary",
					description:
						"Get traffic and signal quality summary for a specific node including RSSI statistics and unsolicited report intervals",
					inputSchema: {
						type: "object",
						properties: {
							nodeId: {
								type: "number",
								description: "The Z-Wave node ID to analyze",
							},
							timeRange: {
								type: "object",
								description:
									"Optional time range to filter analysis",
								properties: {
									start: {
										type: "string",
										description:
											"Start timestamp in ISO format",
									},
									end: {
										type: "string",
										description:
											"End timestamp in ISO format",
									},
								},
							},
						},
						required: ["nodeId"],
					},
				},
				{
					name: "getNodeCommunication",
					description:
						"Enumerate communication attempts with a specific node over a time range, with direction filtering and pagination support",
					inputSchema: {
						type: "object",
						properties: {
							nodeId: {
								type: "number",
								description: "The Z-Wave node ID to analyze",
							},
							timeRange: {
								type: "object",
								description:
									"Optional time range to filter communications",
								properties: {
									start: {
										type: "string",
										description:
											"Start timestamp in ISO format",
									},
									end: {
										type: "string",
										description:
											"End timestamp in ISO format",
									},
								},
							},
							direction: {
								type: "string",
								enum: ["incoming", "outgoing", "both"],
								description:
									"Filter by communication direction",
								default: "both",
							},
							limit: {
								type: "number",
								description:
									"Maximum number of events to return",
								default: 100,
							},
							offset: {
								type: "number",
								description:
									"Number of events to skip for pagination",
								default: 0,
							},
						},
						required: ["nodeId"],
					},
				},
				{
					name: "getEventsAroundTimestamp",
					description:
						"Enumerate all log entries around a specific timestamp with optional type filtering and pagination",
					inputSchema: {
						type: "object",
						properties: {
							timestamp: {
								type: "string",
								description: "Target timestamp in ISO format",
							},
							beforeSeconds: {
								type: "number",
								description:
									"Seconds to look before the timestamp",
								default: 30,
							},
							afterSeconds: {
								type: "number",
								description:
									"Seconds to look after the timestamp",
								default: 30,
							},
							entryTypes: {
								type: "array",
								description:
									"Filter by specific log entry types",
								items: { type: "string" },
							},
							limit: {
								type: "number",
								description:
									"Maximum number of events to return",
								default: 100,
							},
							offset: {
								type: "number",
								description:
									"Number of events to skip for pagination",
								default: 0,
							},
						},
						required: ["timestamp"],
					},
				},
				{
					name: "getBackgroundRSSIBefore",
					description:
						"Get the most recent background RSSI reading before a specific timestamp, with optional maximum age limit in seconds",
					inputSchema: {
						type: "object",
						properties: {
							timestamp: {
								type: "string",
								description: "Target timestamp in ISO format",
							},
							maxAge: {
								type: "number",
								description:
									"Maximum age of RSSI reading in seconds",
							},
							channel: {
								type: "number",
								description:
									"Specific RF channel to get RSSI for",
							},
						},
						required: ["timestamp"],
					},
				},
				{
					name: "searchLogEntries",
					description:
						"Search log entries by keyword/text/regex with optional type and time filtering, supports pagination. Regex patterns are automatically detected (e.g., 'temperature|temp', 'Air.*temperature', '[Bb]attery') but can be explicitly controlled via isRegex parameter.",
					inputSchema: {
						type: "object",
						properties: {
							query: {
								type: "string",
								description:
									"Search query text or regex pattern. Common regex patterns like | (alternation), .* (wildcards), [abc] (character classes), etc. are automatically detected.",
							},
							isRegex: {
								type: "boolean",
								description:
									"Whether the query is a regex pattern. If not specified, regex patterns are auto-detected based on common regex syntax.",
								default: false,
							},
							entryTypes: {
								type: "array",
								description:
									"Filter by specific log entry types",
								items: { type: "string" },
							},
							timeRange: {
								type: "object",
								description:
									"Optional time range to filter search",
								properties: {
									start: {
										type: "string",
										description:
											"Start timestamp in ISO format",
									},
									end: {
										type: "string",
										description:
											"End timestamp in ISO format",
									},
								},
							},
							limit: {
								type: "number",
								description:
									"Maximum number of matches to return",
								default: 100,
							},
							offset: {
								type: "number",
								description:
									"Number of matches to skip for pagination",
								default: 0,
							},
						},
						required: ["query"],
					},
				},
				{
					name: "getLogChunk",
					description:
						"Read specific ranges of log entries by index with pagination support",
					inputSchema: {
						type: "object",
						properties: {
							startIndex: {
								type: "number",
								description:
									"Starting index in the log entries array",
							},
							count: {
								type: "number",
								description: "Number of entries to return",
							},
						},
						required: ["startIndex", "count"],
					},
				},
				{
					name: "loadLogFile",
					description:
						"Load a new Z-Wave log file, clearing all caches and reindexing the data",
					inputSchema: {
						type: "object",
						properties: {
							filePath: {
								type: "string",
								description:
									"Path to the Z-Wave log file to load",
							},
						},
						required: ["filePath"],
					},
				},
			],
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		try {
			switch (name) {
				case "loadLogFile":
					if (typeof args?.filePath !== "string") {
						throw new McpError(
							ErrorCode.InvalidParams,
							"filePath must be a string",
						);
					}
					await loadLogFile(args.filePath);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message: `Successfully loaded log file: ${args.filePath}`,
										summary:
											await queryEngine!.getLogSummary(),
									},
									null,
									2,
								),
							},
						],
					};

				case "getLogSummary":
					await initializeQueryEngine();
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									await queryEngine!.getLogSummary(),
									null,
									2,
								),
							},
						],
					};

				case "getNodeSummary":
					await initializeQueryEngine();
					if (typeof args?.nodeId !== "number") {
						throw new McpError(
							ErrorCode.InvalidParams,
							"nodeId must be a number",
						);
					}
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									await queryEngine!.getNodeSummary({
										nodeId: args.nodeId,
									}),
									null,
									2,
								),
							},
						],
					};

				case "getNodeCommunication":
					await initializeQueryEngine();
					if (typeof args?.nodeId !== "number") {
						throw new McpError(
							ErrorCode.InvalidParams,
							"nodeId must be a number",
						);
					}
					if (
						args.direction &&
						typeof args.direction === "string" &&
						!["incoming", "outgoing", "both"].includes(
							args.direction,
						)
					) {
						throw new McpError(
							ErrorCode.InvalidParams,
							"direction must be one of: incoming, outgoing, both",
						);
					}
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									await queryEngine!.getNodeCommunication({
										nodeId: args.nodeId,
										direction: args.direction as
											| "incoming"
											| "outgoing"
											| "both"
											| undefined,
										limit: args.limit as number | undefined,
										offset: args.offset as
											| number
											| undefined,
									}),
									null,
									2,
								),
							},
						],
					};

				case "getEventsAroundTimestamp":
					await initializeQueryEngine();
					if (typeof args?.timestamp !== "string") {
						throw new McpError(
							ErrorCode.InvalidParams,
							"timestamp must be a string",
						);
					}
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									await queryEngine!.getEventsAroundTimestamp(
										{
											timestamp: args.timestamp,
											beforeSeconds:
												args.beforeSeconds as
													| number
													| undefined,
											afterSeconds: args.afterSeconds as
												| number
												| undefined,
											entryTypes: args.entryTypes as
												| any[]
												| undefined,
											limit: args.limit as
												| number
												| undefined,
											offset: args.offset as
												| number
												| undefined,
										},
									),
									null,
									2,
								),
							},
						],
					};

				case "getBackgroundRSSIBefore":
					await initializeQueryEngine();
					if (typeof args?.timestamp !== "string") {
						throw new McpError(
							ErrorCode.InvalidParams,
							"timestamp must be a string",
						);
					}
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									await queryEngine!.getBackgroundRSSIBefore({
										timestamp: args.timestamp,
										maxAge: args.maxAge as
											| number
											| undefined,
										channel: args.channel as
											| number
											| undefined,
									}),
									null,
									2,
								),
							},
						],
					};

				case "searchLogEntries":
					await initializeQueryEngine();
					if (typeof args?.query !== "string") {
						throw new McpError(
							ErrorCode.InvalidParams,
							"query must be a string",
						);
					}
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									await queryEngine!.searchLogEntries({
										query: args.query,
										isRegex: args.isRegex as
											| boolean
											| undefined,
										entryTypes: args.entryTypes as
											| any[]
											| undefined,
										timeRange: args.timeRange as
											| { start: string; end: string }
											| undefined,
										limit: args.limit as number | undefined,
										offset: args.offset as
											| number
											| undefined,
									}),
									null,
									2,
								),
							},
						],
					};

				case "getLogChunk":
					await initializeQueryEngine();
					if (typeof args?.startIndex !== "number") {
						throw new McpError(
							ErrorCode.InvalidParams,
							"startIndex must be a number",
						);
					}
					if (typeof args?.count !== "number") {
						throw new McpError(
							ErrorCode.InvalidParams,
							"count must be a number",
						);
					}
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									await queryEngine!.getLogChunk({
										startIndex: args.startIndex,
										count: args.count,
									}),
									null,
									2,
								),
							},
						],
					};

				default:
					throw new McpError(
						ErrorCode.MethodNotFound,
						`Unknown tool: ${name}`,
					);
			}
		} catch (error) {
			if (error instanceof McpError) throw error;
			throw new McpError(
				ErrorCode.InternalError,
				`Tool execution failed: ${(error as Error).message}`,
			);
		}
	});

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
