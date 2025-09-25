import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { LogQueryEngine } from "./log-query-engine.js";
import { LogTransformPipeline } from "./log-processor/index.js";

/**
 * Shared MCP server implementation for Z-Wave log analysis.
 * This can be used with different transports (stdio for CLI, EventTarget for browser).
 */
export class ZWaveLogMCPServerCore {
	private server: Server;
	private queryEngine: LogQueryEngine | null = null;
	private pipeline: LogTransformPipeline;

	constructor() {
		this.server = new Server(
			{ name: "zwave-log-analyzer", version: "1.0.0" },
			{ capabilities: { tools: {} } },
		);

		this.pipeline = new LogTransformPipeline();
		this.setupRequestHandlers();
	}

	/**
	 * Get the underlying MCP Server instance
	 */
	getServer(): Server {
		return this.server;
	}

	/**
	 * Get the query engine instance (if available)
	 */
	getQueryEngine(): LogQueryEngine | null {
		return this.queryEngine;
	}

	/**
	 * Initialize the query engine, throwing an error if no log is loaded
	 */
	private async initializeQueryEngine(): Promise<void> {
		if (!this.queryEngine) {
			throw new McpError(
				ErrorCode.InvalidRequest,
				"No log file loaded. Use the loadLogFile tool to load a log file first.",
			);
		}
	}

	/**
	 * Load log file from file path (for CLI usage)
	 */
	private async loadLogFileFromPath(filePath: string): Promise<void> {
		const { readFile } = await import("node:fs/promises");
		const logContent = await readFile(filePath, "utf-8");
		const transformedEntries = await this.pipeline.processLogContent(logContent);
		this.queryEngine = new LogQueryEngine(transformedEntries);
	}

	/**
	 * Load log file from content string (for browser usage)
	 */
	public async loadLogFileFromContent(logContent: string): Promise<void> {
		const transformedEntries = await this.pipeline.processLogContent(logContent);
		this.queryEngine = new LogQueryEngine(transformedEntries);
	}

	/**
	 * Set up all the MCP request handlers
	 */
	private setupRequestHandlers(): void {
		// List tools handler
		this.server.setRequestHandler(ListToolsRequestSchema, async () => {
			return {
				tools: [
					{
						name: "getLogSummary",
						description:
							"Get overall statistics about the entire Z-Wave log including total entries, time range, node IDs, network activity broken down by node, and network-wide unsolicited report intervals",
						inputSchema: {
							type: "object",
							properties: {},
							required: [],
						},
					},
					{
						name: "getNodeSummary",
						description:
							"Get traffic and signal quality summary for a specific node including RSSI statistics, unsolicited report intervals, and command classes used by the node",
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
								entryKinds: {
									type: "array",
									description:
										"Filter by specific log entry kinds",
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
							"Search log entries by keyword/text/regex with optional type and time filtering, supports pagination. The query will search across ALL string fields in log entries recursively (including deeply nested attributes). For regex searches, either wrap your pattern in forward slashes like /pattern/flags or use regex syntax patterns (|, *, +, ?, [], (), etc.) which will be auto-detected. Examples: 'temperature' (plain text), '/temp|battery/i' (explicit regex), 'temp.*sensor' (auto-detected regex), '/node [0-9]+/' (explicit regex). Query can be omitted if attribute filters are provided.",
						inputSchema: {
							type: "object",
							properties: {
								query: {
									type: "string",
									description:
										"Search query text or regex pattern. Searches ALL string-valued fields recursively throughout the log entry. For regex: wrap in forward slashes '/pattern/' or use regex syntax (|, *, +, ?, [], etc.) for auto-detection. Examples: 'battery', '/temp|humidity/', 'node.*[0-9]+'. Can be omitted if attribute filters are provided.",
								},
								entryKinds: {
									type: "array",
									description:
										"Filter by specific log entry kinds",
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
								attributeFilters: {
									type: "array",
									description:
										"Filter log entries by attribute values using comparison operators",
									items: {
										type: "object",
										properties: {
											path: {
												type: "string",
												description:
													"Dot-separated path to the attribute (e.g., 'nodeId', 'payload.attributes.transmit status', 'rssi')",
											},
											operator: {
												type: "string",
												enum: ["gt", "gte", "eq", "lt", "lte", "ne", "match"],
												description:
													"Comparison operator: gt/gte/lt/lte/eq/ne for numbers, match for string/regex searching. For 'match': use plain text for contains search, or wrap in /pattern/ for regex, or use regex syntax for auto-detection",
											},
											value: {
												description:
													"Value to compare against (string, number, or boolean). For 'match' operator: supports same regex patterns as main query",
											},
										},
										required: ["path", "operator", "value"],
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
							required: [],
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

		// Tool execution handler
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const { name, arguments: args } = request.params;

			try {
				switch (name) {
					case "loadLogFile": {
						if (typeof args?.filePath !== "string") {
							throw new McpError(
								ErrorCode.InvalidParams,
								"filePath must be a string",
							);
						}

						// Check if we're running in a browser environment
						const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

						if (isBrowser) {
							// In browser, just return the log summary since we can't load files from path
							// The actual loading should be done via loadLogFileFromContent
							if (!this.queryEngine) {
								throw new McpError(
									ErrorCode.InvalidRequest,
									"No log file loaded. Load log content first using loadLogFileFromContent.",
								);
							}

							return {
								content: [
									{
										type: "text",
										text: JSON.stringify(
											await this.queryEngine.getLogSummary(),
											null,
											2,
										),
									},
								],
							};
						} else {
							// In Node.js, load from file path
							await this.loadLogFileFromPath(args.filePath);
							return {
								content: [
									{
										type: "text",
										text: JSON.stringify(
											{
												success: true,
												message: `Successfully loaded log file: ${args.filePath}`,
												summary: await this.queryEngine!.getLogSummary(),
											},
											null,
											2,
										),
									},
								],
							};
						}
					}

					case "getLogSummary":
						await this.initializeQueryEngine();
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										await this.queryEngine!.getLogSummary(),
										null,
										2,
									),
								},
							],
						};

					case "getNodeSummary":
						await this.initializeQueryEngine();
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
										await this.queryEngine!.getNodeSummary({
											nodeId: args.nodeId,
											timeRange: args.timeRange as { start: string; end: string } | undefined,
										}),
										null,
										2,
									),
								},
							],
						};

					case "getNodeCommunication":
						await this.initializeQueryEngine();
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
										await this.queryEngine!.getNodeCommunication({
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
											timeRange: args.timeRange as { start: string; end: string } | undefined,
										}),
										null,
										2,
									),
								},
							],
						};

					case "getEventsAroundTimestamp":
						await this.initializeQueryEngine();
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
										await this.queryEngine!.getEventsAroundTimestamp(
											{
												timestamp: args.timestamp,
												beforeSeconds:
													args.beforeSeconds as
														| number
														| undefined,
												afterSeconds: args.afterSeconds as
													| number
													| undefined,
												entryKinds: (args.entryKinds || args.entryTypes) as
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
						await this.initializeQueryEngine();
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
										await this.queryEngine!.getBackgroundRSSIBefore({
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

					case "searchLogEntries": {
						await this.initializeQueryEngine();

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										await this.queryEngine!.searchLogEntries({
											query: (typeof args?.query === "string" ? args.query : ""),
											entryKinds: (args?.entryKinds || args?.entryTypes) as
												| any[]
												| undefined,
											timeRange: args?.timeRange as
												| { start: string; end: string }
												| undefined,
											attributeFilters: args?.attributeFilters as
												| any[]
												| undefined,
											limit: args?.limit as number | undefined,
											offset: args?.offset as
												| number
												| undefined,
										}),
										null,
										2,
									),
								},
							],
						};
					}

					case "getLogChunk":
						await this.initializeQueryEngine();
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
										await this.queryEngine!.getLogChunk({
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
	}
}
