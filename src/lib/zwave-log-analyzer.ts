import { readFile } from "node:fs/promises";
import { LogTransformPipeline } from "./log-processor/index.js";
import { GeminiLogAnalyzer, GEMINI_MODEL_ID } from "./ai/gemini-client.js";

/**
 * Simplified Z-Wave log analyzer that handles all the complexity internally.
 * This is the main class that users should interact with.
 */
export class ZWaveLogAnalyzer {
	private pipeline: LogTransformPipeline;
	private analyzer: GeminiLogAnalyzer;
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
			// Read and process the log file
			const logContent = await readFile(logFilePath, "utf8");
			const transformedLog =
				await this.pipeline.processLogContent(logContent);

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
				`Failed to analyze log file: ${(error as Error).message}`,
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
}
