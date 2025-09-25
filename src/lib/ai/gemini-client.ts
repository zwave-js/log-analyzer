import {
	GoogleGenAI,
	createUserContent,
	createPartFromUri,
	Chat,
	mcpToTool,
	type Part,
	FunctionCallingConfigMode,
} from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
	EventTargetTransport,
	createEventTargetTransportPair,
} from "../eventtarget-transport.js";
import { ZWaveLogMCPServerCore } from "../zwave-mcp-server-core.js";
import type { GeminiConfig, GeminiFileInfo } from "../types.js";
import { SYSTEM_PROMPT } from "./analysis-prompt.js";

// Gemini model constant
export const GEMINI_MODEL_ID = "gemini-2.5-flash";

export class GeminiLogAnalyzer {
	private genAI: GoogleGenAI;
	private modelName: string;
	private systemPromptFile: GeminiFileInfo | null = null;
	private chatSession: Chat | null = null;
	private mcpClient: Client;
	private mcpServer: ZWaveLogMCPServerCore;
	private clientTransport: EventTargetTransport;
	private serverTransport: EventTargetTransport;
	private hasLoadedLogFile = false;

	constructor(config: GeminiConfig) {
		console.log(
			"Initializing Gemini Log Analyzer with model:",
			config.model,
		);
		this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
		this.modelName = config.model;

		// Create transport pair for in-browser communication
		const transportPair = createEventTargetTransportPair();
		this.clientTransport = transportPair.clientTransport;
		this.serverTransport = transportPair.serverTransport;

		// Create SDK client with the transport
		this.mcpClient = new Client(
			{
				name: "zwave-log-client",
				version: "0.0.2",
			},
			{
				capabilities: {},
			},
		);

		// Create and configure server
		this.mcpServer = new ZWaveLogMCPServerCore();

		// Initialize the client connection
		console.log("Starting MCP client connection...");
		this.connect().catch((error: Error) => {
			console.error("Failed to connect MCP client:", error);
		});
	}

	/**
	 * Connect the MCP client to the server
	 */
	private async connect(): Promise<void> {
		console.log("Connecting MCP client to server...");
		// Connect client to its transport
		await this.mcpClient.connect(this.clientTransport);
		console.log("MCP client connected to transport");

		// Connect server to its transport
		await this.mcpServer.getServer().connect(this.serverTransport);
		console.log("MCP server connected to transport");
	}

	/**
	 * Disconnect the MCP client and server
	 */
	async disconnect(): Promise<void> {
		try {
			await this.mcpClient.close();
			await this.mcpServer.getServer().close();
		} catch (error) {
			console.error("Error disconnecting MCP client/server:", error);
		}
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
	 * Uses the mcpToTool wrapper for proper MCP integration
	 */
	async createChatSession(): Promise<void> {
		if (!this.systemPromptFile) {
			throw new Error(
				"System prompt not initialized. Please check your API key and try again.",
			);
		}

		try {
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
							{
								text: "Follow the instructions to analyze Z-Wave log files using the available MCP tools and answer the user's query about the log file.",
							},
							{
								text: `--- USER QUERIES:`,
							},
						],
					},
				],
				config: {
					// thinkingConfig: {
					// 	includeThoughts: true,
					// },
					tools: [mcpToTool(this.mcpClient)],
					toolConfig: {
						functionCallingConfig: {
							mode: FunctionCallingConfigMode.ANY,
						},
					},
				},
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
	 * MCP tools are automatically handled by the SDK
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
			console.log("Sending message to chat session:", query);

			// Use the chat session's sendMessageStream method
			// The SDK automatically handles MCP tool calls
			const response = await this.chatSession.sendMessageStream({
				message: query,
			});

			console.log("Processing chat response stream...");
			for await (const chunk of response) {
				if (chunk.usageMetadata) {
					console.log("Usage metadata:", chunk.usageMetadata);
				}
				const parts = chunk.candidates?.[0]?.content?.parts;
				if (!parts || parts.length === 0) continue;

				// // The first part possibly contains a thought signature
				// if (parts[0]!.thoughtSignature) {
				// 	console.log(
				// 		"AI thought signature:",
				// 		parts[0]!.thoughtSignature,
				// 	);
				// 	this.thoughtParts.push(parts[0]!);
				// }

				// Log any tool calls that are being made
				if (chunk.functionCalls) {
					console.log(
						"AI is making function calls:",
						chunk.functionCalls.map((fc) => fc.name),
					);
				}

				for (const part of parts) {
					// if part.candidates[0]!.content?.parts
					if (part.thought) {
						console.log("AI thought:", part.text);
						continue;
					}
					if (part.text) {
						yield part.text;
					}
				}
			}

			console.log("Chat response stream completed");
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
	 * Enable or disable tool calling
	 */
	/**
	 * Get the MCP client instance
	 */
	getMCPClient(): Client {
		return this.mcpClient;
	}

	/**
	 * Get the MCP server core for direct access
	 */
	getMCPServer(): ZWaveLogMCPServerCore {
		return this.mcpServer;
	}

	/**
	 * Load log content directly into the MCP server
	 */
	async loadLogContentForToolCalling(logContent: string): Promise<void> {
		console.log(
			"Loading log content for tool calling, size:",
			logContent.length,
		);
		await this.mcpServer.loadLogFileFromContent(logContent);
		this.hasLoadedLogFile = true;
		console.log("Log content loaded successfully for tool calling");
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
		// In tool calling mode, we track if we've loaded a log file
		return this.hasLoadedLogFile;
	}

	/**
	 * Get file information
	 */
	getFileInfo(): {
		systemPrompt: GeminiFileInfo | null;
	} {
		return {
			systemPrompt: this.systemPromptFile,
		};
	}
}
