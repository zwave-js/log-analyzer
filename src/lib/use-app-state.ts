import { useReducer, useCallback, useEffect } from "react";
import { appReducer } from "./app-reducer";
import { initialState, selectors, type ChatMessage } from "./app-state";
import { GeminiLogAnalyzer, GEMINI_MODEL_ID } from "./ai/gemini-client";
import { LogTransformPipeline } from "./log-processor";
import type { TransformedLog } from "./types";

// Utility function to parse rate limit errors from Gemini API
function parseRateLimitError(errorMessage: string): {
	isRateLimit: boolean;
	retryAfter?: number;
} {
	try {
		// The error message might be JSON wrapped in a larger error message
		let jsonStr = errorMessage;

		// Try to extract JSON from the error message
		const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			jsonStr = jsonMatch[0];
		}

		const errorObj = JSON.parse(jsonStr);

		// Check if this is a rate limit error
		if (errorObj.error && errorObj.error.code === 429) {
			// Extract retry delay from the message or details
			let retryAfter: number | undefined;

			if (errorObj.error.message) {
				// Look for "Please retry in X.Ys" pattern
				const retryMatch = errorObj.error.message.match(/Please retry in (\d+(?:\.\d+)?)s/);
				if (retryMatch) {
					retryAfter = Math.ceil(parseFloat(retryMatch[1])) * 1000; // Convert to milliseconds
				}
			}

			// Also check in details for RetryInfo
			if (errorObj.error.details) {
				for (const detail of errorObj.error.details) {
					if (detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo" && detail.retryDelay) {
						// retryDelay is in format like "26s"
						const delayMatch = detail.retryDelay.match(/(\d+)s/);
						if (delayMatch) {
							retryAfter = parseInt(delayMatch[1]) * 1000; // Convert to milliseconds
						}
					}
				}
			}

			return {
				isRateLimit: true,
				retryAfter,
			};
		}
	} catch {
		// Not a JSON error or not parseable
	}

	return { isRateLimit: false };
}

export function useAppState() {
	const [state, dispatch] = useReducer(appReducer, initialState);

	// Initialize analyzer when API key changes
	const initializeAnalyzer = useCallback(async (apiKey: string) => {
		if (!apiKey) {
			dispatch({ type: "SET_ANALYZER", payload: null });
			dispatch({ type: "SET_API_KEY_STATE", payload: "missing" });
			return;
		}

		try {
			dispatch({
				type: "SET_API_KEY_STATE",
				payload: "uploading-system-prompt",
			});

			const analyzer = new GeminiLogAnalyzer({
				apiKey,
				model: GEMINI_MODEL_ID,
			});

			// Upload system prompt
			await analyzer.uploadSystemPrompt();

			// Count system prompt tokens
			const systemPromptTokens = await analyzer.countTokens("");

			dispatch({ type: "SET_ANALYZER", payload: analyzer });
			dispatch({ type: "SET_API_KEY_STATE", payload: "exists" });
			dispatch({
				type: "UPDATE_TOKEN_COUNTS",
				payload: { systemPrompt: systemPromptTokens },
			});
		} catch (err) {
			console.error("Failed to initialize analyzer:", err);
			dispatch({
				type: "SET_ERROR",
				payload: `Failed to initialize AI: ${(err as Error).message}`,
			});
			dispatch({ type: "SET_API_KEY_STATE", payload: "missing" });
		}
	}, []);

	// Initialize analyzer when API key is set
	useEffect(() => {
		if (state.apiKey) {
			initializeAnalyzer(state.apiKey);
		}
	}, [state.apiKey, initializeAnalyzer]);

	// Update log file token count when log is uploaded
	const updateLogFileTokens = useCallback(async () => {
		if (!state.analyzer || state.logFileState !== "attached") return;

		try {
			// Count tokens with system prompt + log file (no user query)
			const totalTokens = await state.analyzer.countTokens("");
			const logFileTokens = Math.max(
				0,
				totalTokens - state.tokenCounts.systemPrompt,
			);

			dispatch({
				type: "UPDATE_TOKEN_COUNTS",
				payload: { logFile: logFileTokens },
			});
		} catch (err) {
			console.warn("Failed to update log file token count:", err);
		}
	}, [state.analyzer, state.logFileState, state.tokenCounts.systemPrompt]);

	// Update log file tokens when relevant state changes
	useEffect(() => {
		if (state.logFileState === "attached") {
			updateLogFileTokens();
		}
	}, [state.logFileState, updateLogFileTokens]);

	// Actions
	const actions = {
		setApiKey: useCallback((apiKey: string) => {
			dispatch({ type: "SET_API_KEY", payload: apiKey });
		}, []),

		setCurrentQuery: useCallback((query: string) => {
			dispatch({ type: "SET_CURRENT_QUERY", payload: query });
		}, []),

		uploadLogFile: useCallback(
			async (content: string, filename: string) => {
				if (!state.analyzer) {
					dispatch({
						type: "SET_ERROR",
						payload:
							"AI not initialized. Please check your API key.",
					});
					return false;
				}

				dispatch({ type: "CLEAR_ERROR" });
				dispatch({ type: "SET_LOG_FILE_STATE", payload: "uploading" });
				dispatch({ type: "SET_ATTACHED_FILE_NAME", payload: filename });

				try {
					const pipeline = new LogTransformPipeline();
					const entries = await pipeline.processLogContent(content);

					const transformedLog: TransformedLog = {
						entries,
					};

					dispatch({
						type: "SET_PROCESSED_LOGS",
						payload: transformedLog,
					});

					// Upload to Gemini
					await state.analyzer.uploadLogFile(transformedLog);
					dispatch({
						type: "SET_LOG_FILE_STATE",
						payload: "attached",
					});

					return true;
				} catch (err) {
					dispatch({
						type: "SET_ERROR",
						payload: `Failed to process log file: ${(err as Error).message}`,
					});
					dispatch({ type: "SET_PROCESSED_LOGS", payload: null });
					dispatch({ type: "SET_LOG_FILE_STATE", payload: "none" });
					dispatch({ type: "SET_ATTACHED_FILE_NAME", payload: "" });
					return false;
				}
			},
			[state.analyzer],
		),

		removeLogFile: useCallback(async () => {
			if (!state.analyzer) return;

			// Immediately update UI state
			if (state.analyzer.hasChatSession()) {
				state.analyzer.endChatSession();
				dispatch({ type: "END_CHAT_SESSION" });
			}

			dispatch({ type: "SET_LOG_FILE_STATE", payload: "none" });
			dispatch({ type: "SET_PROCESSED_LOGS", payload: null });
			dispatch({ type: "SET_ATTACHED_FILE_NAME", payload: "" });
			dispatch({ type: "UPDATE_TOKEN_COUNTS", payload: { logFile: 0 } });

			// Delete from backend in background
			try {
				await state.analyzer.deleteLogFile();
			} catch (err) {
				console.error("Failed to delete log file from backend:", err);
				// Don't show error to user since UI is already updated
			}
		}, [state.analyzer]),

		sendMessage: useCallback(
			async (query: string) => {
				if (!selectors.canSendMessage(state)) {
					if (state.apiKeyState !== "exists") {
						dispatch({
							type: "SET_ERROR",
							payload: "Please configure your API key first",
						});
						dispatch({ type: "SET_SETTINGS_OPEN", payload: true });
					} else if (state.logFileState !== "attached") {
						dispatch({
							type: "SET_ERROR",
							payload: "Please upload a log file first",
						});
					}
					return;
				}

				const userMessage: ChatMessage = {
					id: Date.now().toString(),
					type: "user",
					content: query.trim(),
					timestamp: new Date(),
					attachedFileName: state.attachedFileName || undefined,
				};

				dispatch({ type: "ADD_MESSAGE", payload: userMessage });
				dispatch({ type: "CLEAR_ERROR" });

				const isFirstMessage = state.messages.length === 0;

				try {
					let stream: AsyncGenerator<string, void, unknown>;

					if (isFirstMessage) {
						// First message: create chat session and send first message
						console.log(
							"Sending first message, creating chat session",
						);
						console.log(
							"Current state - logFileState:",
							state.logFileState,
							"apiKeyState:",
							state.apiKeyState,
						);
						dispatch({ type: "START_FIRST_RESPONSE" });
						stream = state.analyzer!.sendFirstChatMessage(query);
						dispatch({ type: "START_CHAT_SESSION" });
					} else if (state.analyzer!.hasChatSession()) {
						// Followup message: use existing chat session
						console.log(
							"Sending followup message to existing chat session",
						);
						dispatch({
							type: "SET_UI_STATE",
							payload: "waiting-for-ai-response",
						});
						stream = state.analyzer!.sendChatMessage(query);
					} else {
						// Fallback: create new chat session if somehow we lost it
						console.log("No chat session found, creating new one");
						dispatch({ type: "START_FIRST_RESPONSE" });
						stream = state.analyzer!.sendFirstChatMessage(query);
						dispatch({ type: "START_CHAT_SESSION" });
					}

					let fullResponse = "";
					for await (const chunk of stream) {
						fullResponse += chunk;
						dispatch({
							type: "UPDATE_CURRENT_RESPONSE",
							payload: fullResponse,
						});
					}

					dispatch({ type: "FINISH_RESPONSE" });
				} catch (err) {
					const errorMessage = (err as Error).message;

					// Check if this is a rate limit error first
					const rateLimitInfo = parseRateLimitError(errorMessage);

					if (rateLimitInfo.isRateLimit) {
						// Remove the last user message that caused the rate limit
						dispatch({ type: "REMOVE_LAST_MESSAGE" });

						// Set up rate limiting and store the query to restore later
						const retryAfterTimestamp = rateLimitInfo.retryAfter ?
							Date.now() + rateLimitInfo.retryAfter :
							Date.now() + 30000; // Default to 30 seconds if not specified

						dispatch({
							type: "SET_RATE_LIMITED",
							payload: {
								isRateLimited: true,
								retryAfter: retryAfterTimestamp,
								pendingQuery: query, // Store the query to restore later
							}
						});

						// Set up a timer to clear the rate limit
						setTimeout(() => {
							dispatch({ type: "CLEAR_RATE_LIMIT" });
						}, rateLimitInfo.retryAfter || 30000);

						return; // Don't set error state for rate limits
					}

					// Check if it's a context limit error
					if (
						errorMessage.includes("context") ||
						errorMessage.includes("limit") ||
						errorMessage.includes("too large")
					) {
						dispatch({
							type: "SET_ERROR",
							payload:
								"The conversation has exceeded the model's context limit. Please start a new conversation to continue.",
						});
					} else {
						dispatch({ type: "SET_ERROR", payload: errorMessage });
					}

					dispatch({ type: "SET_UI_STATE", payload: "idle" });
				}
			},
			[state],
		),

		openSettings: useCallback(() => {
			dispatch({ type: "SET_SETTINGS_OPEN", payload: true });
		}, []),

		closeSettings: useCallback(() => {
			dispatch({ type: "SET_SETTINGS_OPEN", payload: false });
		}, []),

		clearError: useCallback(() => {
			dispatch({ type: "CLEAR_ERROR" });
		}, []),

		setRateLimited: useCallback((isRateLimited: boolean, retryAfter?: number, pendingQuery?: string) => {
			dispatch({
				type: "SET_RATE_LIMITED",
				payload: { isRateLimited, retryAfter, pendingQuery }
			});
		}, []),

		clearRateLimit: useCallback(() => {
			dispatch({ type: "CLEAR_RATE_LIMIT" });
		}, []),

		newChat: useCallback(() => {
			// Clear any existing greeting storage entries immediately
			for (let i = 0; i < sessionStorage.length; i++) {
				const key = sessionStorage.key(i);
				if (key?.startsWith("zwave-greeting-")) {
					sessionStorage.removeItem(key);
					i--; // Adjust index since we removed an item
				}
			}

			// Reset state IMMEDIATELY for responsive UI
			dispatch({ type: "NEW_CHAT" });

			// Perform cleanup in the background (don't await)
			if (state.analyzer) {
				const analyzer = state.analyzer; // Capture reference to avoid null issues
				(async () => {
					try {
						if (analyzer.hasChatSession()) {
							await analyzer.endChatSession();
						}
						if (state.logFileState === "attached") {
							await analyzer.deleteLogFile();
						}
					} catch (err) {
						console.error("Failed to cleanup during reset:", err);
						// Don't show error to user since UI is already reset
					}
				})();
			}
		}, [state.analyzer, state.logFileState]),
	};

	return {
		state,
		actions,
		selectors: {
			canSendMessage: selectors.canSendMessage(state),
			isUploading: selectors.isUploading(state),
			hasStartedChat: selectors.hasStartedChat(state),
			inputBoxPosition: selectors.inputBoxPosition(state),
			showLogFileChip: selectors.showLogFileChip(state),
			showAttachmentIndicator: selectors.showAttachmentIndicator(state),
		},
	};
}
