import { readFile } from "node:fs/promises";
import { LogTransformPipeline } from "./log-processor/index.js";
import { GeminiLogAnalyzer, GEMINI_MODEL_ID } from "./ai/gemini-client.js";
import { LogQueryEngine } from "./log-query-engine.js";
import type {
	GetNodeSummaryArgs,
	GetNodeCommunicationArgs,
	GetEventsAroundTimestampArgs,
	GetBackgroundRSSIBeforeArgs,
	SearchLogEntriesArgs,
	GetLogChunkArgs
} from "./log-query-engine.js";

/**
 * Simplified Z-Wave log analyzer that handles all the complexity internally.
 * This is the main class that users should interact with.
 */
export class ZWaveLogAnalyzer {
	private pipeline: LogTransformPipeline;
	private analyzer: GeminiLogAnalyzer;
	private queryEngine: LogQueryEngine | null = null;
	private initialized = false;

	/**
	 * Create a new Z-Wave log analyzer instance.
	 * @param apiKey - Your Google Gemini API key
	 */
	constructor(apiKey: string) {
		this.pipeline = new LogTransformPipeline();
		this.analyzer = new GeminiLogAnalyzer({
			apiKey,
			model: GEMINI_MODEL_ID,
		});
	}

	/**
	 * Analyze a log file with the given query.
	 * This method handles reading the file, transforming it, and performing AI analysis.
	 *
	 * @param logFilePath - Path to the Z-Wave JS log file to analyze
	 * @param query - Question or instruction for the AI analysis
	 * @returns AsyncGenerator that yields response chunks as they arrive
	 *
	 * @example
	 * ```typescript
	 * const analyzer = new ZWaveLogAnalyzer(process.env.GEMINI_API_KEY!);
	 *
	 * for await (const chunk of analyzer.analyzeLogFile("./logs/zwave.log", "What issues do you see?")) {
	 *   process.stdout.write(chunk);
	 * }
	 * ```
	 */
	async *analyzeLogFile(
		logFilePath: string,
		query: string,
	): AsyncGenerator<string, void, unknown> {
		try {
			const logContent = await readFile(logFilePath, "utf8");
			yield* this.analyzeLogContent(logContent, query);
		} catch (error) {
			throw new Error(
				`Failed to analyze log file: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Analyze log content directly without reading from a file.
	 *
	 * @param logContent - The raw log content as a string
	 * @param query - Question or instruction for the AI analysis
	 * @returns AsyncGenerator that yields response chunks as they arrive
	 */
	async *analyzeLogContent(
		logContent: string,
		query: string,
	): AsyncGenerator<string, void, unknown> {
		try {
			// Process the log content
			const transformedLog =
				await this.pipeline.processLogContent(logContent);

			// Initialize the query engine for tool access
			this.queryEngine = new LogQueryEngine(transformedLog);

			// Initialize the AI analyzer if not already done
			if (!this.initialized) {
				await this.analyzer.uploadSystemPrompt();
				this.initialized = true;
			}

			// Upload the transformed log file
			await this.analyzer.uploadLogFile({
				entries: transformedLog,
			});

			// Perform the analysis and stream results
			yield* this.analyzer.sendFirstChatMessage(query);
		} catch (error) {
			throw new Error(
				`Failed to analyze log content: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Continue the analysis with a new query.
	 * This method can be called after analyzeLogFile to ask follow-up questions.
	 *
	 * @param query - Follow-up question or instruction
	 * @returns AsyncGenerator that yields response chunks as they arrive
	 *
	 * @example
	 * ```typescript
	 * // After calling analyzeLogFile...
	 * for await (const chunk of analyzer.continueAnalysis("Can you explain the error in more detail?")) {
	 *   process.stdout.write(chunk);
	 * }
	 * ```
	 */
	async *continueAnalysis(
		query: string,
	): AsyncGenerator<string, void, unknown> {
		if (!this.analyzer.hasChatSession()) {
			throw new Error(
				"No active analysis session. Please call analyzeLogFile first.",
			);
		}

		try {
			yield* this.analyzer.sendChatMessage(query);
		} catch (error) {
			throw new Error(
				`Failed to continue analysis: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Get the query engine for direct tool access.
	 * This allows you to use the individual query tools programmatically.
	 *
	 * @returns The LogQueryEngine instance, or null if not initialized
	 */
	getQueryEngine(): LogQueryEngine | null {
		return this.queryEngine;
	}

	// Tool convenience methods that delegate to the query engine
	async getLogSummary() {
		if (!this.queryEngine) {
			throw new Error(
				"Query engine not initialized. Call analyzeLogFile or analyzeLogContent first.",
			);
		}
		return this.queryEngine.getLogSummary();
	}

	async getNodeSummary(args: GetNodeSummaryArgs) {
		if (!this.queryEngine) {
			throw new Error(
				"Query engine not initialized. Call analyzeLogFile or analyzeLogContent first.",
			);
		}
		return this.queryEngine.getNodeSummary(args);
	}

	async getNodeCommunication(args: GetNodeCommunicationArgs) {
		if (!this.queryEngine) {
			throw new Error(
				"Query engine not initialized. Call analyzeLogFile or analyzeLogContent first.",
			);
		}
		return this.queryEngine.getNodeCommunication(args);
	}

	async getEventsAroundTimestamp(args: GetEventsAroundTimestampArgs) {
		if (!this.queryEngine) {
			throw new Error(
				"Query engine not initialized. Call analyzeLogFile or analyzeLogContent first.",
			);
		}
		return this.queryEngine.getEventsAroundTimestamp(args);
	}

	async getBackgroundRSSIBefore(args: GetBackgroundRSSIBeforeArgs) {
		if (!this.queryEngine) {
			throw new Error(
				"Query engine not initialized. Call analyzeLogFile or analyzeLogContent first.",
			);
		}
		return this.queryEngine.getBackgroundRSSIBefore(args);
	}

	async searchLogEntries(args: SearchLogEntriesArgs) {
		if (!this.queryEngine) {
			throw new Error(
				"Query engine not initialized. Call analyzeLogFile or analyzeLogContent first.",
			);
		}
		return this.queryEngine.searchLogEntries(args);
	}

	async getLogChunk(args: GetLogChunkArgs) {
		if (!this.queryEngine) {
			throw new Error(
				"Query engine not initialized. Call analyzeLogFile or analyzeLogContent first.",
			);
		}
		return this.queryEngine.getLogChunk(args);
	}
}
