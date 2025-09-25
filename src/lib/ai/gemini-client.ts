import {
	GoogleGenAI,
	createUserContent,
	createPartFromUri,
	Chat,
} from "@google/genai";
import type { GeminiConfig, GeminiFileInfo, TransformedLog } from "../types.js";
import { SYSTEM_PROMPT } from "./analysis-prompt.js";
import { LogQueryEngine } from "../log-query-engine.js";

// Gemini model constant
export const GEMINI_MODEL_ID = "gemini-2.5-pro";

export class GeminiLogAnalyzer {
	private genAI: GoogleGenAI;
	private modelName: string;
	private systemPromptFile: GeminiFileInfo | null = null;
	private logFile: GeminiFileInfo | null = null;
	private chatSession: Chat | null = null;

	constructor(config: GeminiConfig) {
		this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
		this.modelName = config.model;
	}

	/**
	 * Upload the system prompt to Gemini and store the file URI
	 */
	async uploadSystemPrompt(): Promise<GeminiFileInfo> {
		try {
			const response = await this.genAI.files.upload({
				file: new Blob([SYSTEM_PROMPT], { type: "text/plain" }),
				config: { mimeType: "text/plain" },
			});

			if (!response.uri) {
				throw new Error("No URI returned from file upload");
			}

			this.systemPromptFile = {
				name: response.name!,
				uri: response.uri,
				mimeType: "text/plain",
			};

			return this.systemPromptFile;
		} catch (error) {
			console.error("Failed to upload system prompt:", error);
			throw new Error(
				`System prompt upload failed: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Upload a transformed log file to Gemini and store the file URI
	 */
	async uploadLogFile(
		transformedLog: TransformedLog,
	): Promise<GeminiFileInfo> {
		try {
			// Create query engine to generate summaries
			const queryEngine = new LogQueryEngine(transformedLog.entries);

			const jsonLines: string[] = [];

			// Generate log summary
			const logSummary = await queryEngine.getLogSummary();
			jsonLines.push(
				JSON.stringify({
					kind: "LOG_SUMMARY",
					...logSummary,
				}),
			);

			// Generate node summaries for each node
			for (const nodeId of logSummary.nodeIds) {
				const nodeSummary = await queryEngine.getNodeSummary({
					nodeId,
				});
				jsonLines.push(
					JSON.stringify({
						kind: "NODE_SUMMARY",
						...nodeSummary,
					}),
				);
			}

			// Convert log entries to JSON lines format

			for (const entry of transformedLog.entries) {
				jsonLines.push(JSON.stringify(entry));
			}

			const response = await this.genAI.files.upload({
				file: new Blob([jsonLines.join("\n")], { type: "text/plain" }),
				config: { mimeType: "text/plain" },
			});

			if (!response.uri) {
				throw new Error("No URI returned from file upload");
			}

			this.logFile = {
				name: response.name!,
				uri: response.uri,
				mimeType: response.mimeType!,
			};

			return this.logFile;
		} catch (error) {
			console.error("Failed to upload log file:", error);
			throw new Error(
				`Log file upload failed: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Remove the log file from Gemini and end any active chat session
	 */
	async deleteLogFile(): Promise<void> {
		if (!this.logFile) return;

		try {
			await this.genAI.files.delete({ name: this.logFile.uri });
			this.logFile = null;
			this.endChatSession(); // End chat session when log file is deleted
		} catch (error) {
			console.error("Failed to delete log file:", error);
		}
	}

	/**
	 * Count tokens for the current configuration
	 */
	async countTokens(query: string): Promise<number> {
		try {
			const parts = [];

			// Add system prompt file if available
			if (this.systemPromptFile) {
				parts.push(
					createPartFromUri(
						this.systemPromptFile.uri,
						this.systemPromptFile.mimeType,
					),
				);
			}

			// Add log file if available
			if (this.logFile) {
				parts.push(
					createPartFromUri(this.logFile.uri, this.logFile.mimeType),
				);
			}

			// Add user query
			parts.push({ text: query });

			const result = await this.genAI.models.countTokens({
				model: this.modelName,
				contents: createUserContent(parts),
			});

			return result.totalTokens || 0;
		} catch (error) {
			console.warn("Token counting failed:", error);
			return 0;
		}
	}

	/**
	 * Create a new chat session with the system prompt and log file in history
	 */
	async createChatSession(): Promise<void> {
		if (!this.systemPromptFile) {
			throw new Error(
				"System prompt not initialized. Please check your API key and try again.",
			);
		}

		if (!this.logFile) {
			throw new Error("Please upload a log file first");
		}

		try {
			// Create chat session using chats.create with system prompt and log file in history
			this.chatSession = this.genAI.chats.create({
				model: this.modelName,
				history: [
					{
						role: "user",
						parts: [
							createPartFromUri(
								this.systemPromptFile.uri,
								this.systemPromptFile.mimeType,
							),
							createPartFromUri(
								this.logFile.uri,
								this.logFile.mimeType,
							),
							{
								text: `Follow the instructions in ${this.systemPromptFile.name} to analyze the log file in ${this.logFile.name} and answer the user's query about the log file.`,
							},
							{
								text: `--- USER QUERIES:`,
							},
						],
					},
				],
			});
		} catch (error) {
			console.error("Failed to create chat session:", error);
			throw new Error(
				`Chat session creation failed: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Send a message to the existing chat session
	 */
	async *sendChatMessage(
		query: string,
	): AsyncGenerator<string, void, unknown> {
		if (!this.chatSession) {
			throw new Error(
				"No active chat session. Please start a new chat first.",
			);
		}

		try {
			// Use the chat session's sendMessageStream method
			const response = await this.chatSession.sendMessageStream({
				message: query,
			});

			for await (const part of response) {
				if (part.usageMetadata) {
					console.log("Usage metadata:", part.usageMetadata);
				}
				if (part.text) {
					yield part.text;
				}
			}
		} catch (error) {
			console.error("Chat message error:", error);
			throw new Error(
				`Failed to send chat message: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Send the first message to a newly created chat session
	 * This replaces the old streamAnalysis method for initial questions
	 */
	async *sendFirstChatMessage(
		query: string,
	): AsyncGenerator<string, void, unknown> {
		try {
			// Create chat session first
			await this.createChatSession();

			// Verify chat session was created
			if (!this.chatSession) {
				throw new Error("Chat session is null after creation");
			}

			if (typeof this.chatSession.sendMessageStream !== "function") {
				throw new Error(
					"Chat session does not have sendMessageStream method",
				);
			}

			// Then send the first message
			yield* this.sendChatMessage(query);
		} catch (error) {
			console.error("Error in sendFirstChatMessage:", error);
			// If chat session creation fails, we should still be able to analyze
			// Let's throw a more descriptive error
			throw new Error(
				`Failed to start conversation: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * End the current chat session
	 */
	endChatSession(): void {
		this.chatSession = null;
	}

	/**
	 * Check if there's an active chat session
	 */
	hasChatSession(): boolean {
		return this.chatSession !== null;
	}

	/**
	 * Get the system prompt text
	 */
	getSystemPrompt(): string {
		return SYSTEM_PROMPT;
	}

	/**
	 * Check if system prompt is uploaded
	 */
	hasSystemPrompt(): boolean {
		return this.systemPromptFile !== null;
	}

	/**
	 * Check if log file is uploaded
	 */
	hasLogFile(): boolean {
		return this.logFile !== null;
	}

	/**
	 * Get file information
	 */
	getFileInfo(): {
		systemPrompt: GeminiFileInfo | null;
		logFile: GeminiFileInfo | null;
	} {
		return {
			systemPrompt: this.systemPromptFile,
			logFile: this.logFile,
		};
	}
}
