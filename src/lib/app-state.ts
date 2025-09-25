import type { TransformedLog } from "./types";
import type { GeminiLogAnalyzer } from "./ai/gemini-client";

// User input states
export type LogFileState = "none" | "uploading" | "attached";
export type ApiKeyState = "missing" | "uploading-system-prompt" | "exists";
export type UserQueryState = "empty" | "not-empty";

// UI states
export type UIState =
	| "initial"
	| "waiting-for-ai-response"
	| "ai-responding"
	| "idle";

// Chat message type
export interface ChatMessage {
	id: string;
	type: "user" | "assistant";
	content: string;
	timestamp: Date;
	attachedFileName?: string;
}

// Token counts
export interface TokenCounts {
	systemPrompt: number;
	logFile: number;
	userQuery: number;
	total: number;
}

// Main application state
export interface ApplicationState {
	// API & Configuration
	apiKey: string;
	analyzer: GeminiLogAnalyzer | null;

	// User input states
	logFileState: LogFileState;
	apiKeyState: ApiKeyState;
	userQueryState: UserQueryState;

	// UI state
	uiState: UIState;

	// Data
	processedLogs: TransformedLog | null;
	currentQuery: string;
	attachedFileName: string;

	// Chat
	messages: ChatMessage[];
	currentResponse: string;
	hasChatSession: boolean; // Track if a chat session has been created
	isFirstResponse: boolean; // Track if we're waiting for the first AI response
	firstResponseStartTime: number | null; // Track when first response started

	// Token tracking
	tokenCounts: TokenCounts;

	// UI state
	settingsOpen: boolean;
	error: string;

	// Reset key for forcing component resets
	resetKey: number;
}

// Action types
export type AppAction =
	| { type: "SET_API_KEY"; payload: string }
	| { type: "SET_ANALYZER"; payload: GeminiLogAnalyzer | null }
	| { type: "SET_LOG_FILE_STATE"; payload: LogFileState }
	| { type: "SET_API_KEY_STATE"; payload: ApiKeyState }
	| { type: "SET_UI_STATE"; payload: UIState }
	| { type: "SET_PROCESSED_LOGS"; payload: TransformedLog | null }
	| { type: "SET_CURRENT_QUERY"; payload: string }
	| { type: "SET_ATTACHED_FILE_NAME"; payload: string }
	| { type: "ADD_MESSAGE"; payload: ChatMessage }
	| { type: "UPDATE_CURRENT_RESPONSE"; payload: string }
	| { type: "FINISH_RESPONSE" }
	| { type: "UPDATE_TOKEN_COUNTS"; payload: Partial<TokenCounts> }
	| { type: "SET_SETTINGS_OPEN"; payload: boolean }
	| { type: "SET_ERROR"; payload: string }
	| { type: "CLEAR_ERROR" }
	| { type: "NEW_CHAT" }
	| { type: "START_CHAT_SESSION" }
	| { type: "END_CHAT_SESSION" }
	| { type: "START_FIRST_RESPONSE" };

// Derived state selectors
export const selectors = {
	canSendMessage: (state: ApplicationState): boolean => {
		return state.apiKeyState === "exists" &&
			state.logFileState === "attached" &&
			state.userQueryState === "not-empty" &&
			state.uiState !== "waiting-for-ai-response" &&
			state.uiState !== "ai-responding" &&
			state.tokenCounts.total <= 1000000;
	},

	isUploading: (state: ApplicationState): boolean => {
		return (
			state.logFileState === "uploading" ||
			state.apiKeyState === "uploading-system-prompt"
		);
	},

	hasStartedChat: (state: ApplicationState): boolean => {
		return state.hasChatSession;
	},

	inputBoxPosition: (state: ApplicationState): "center" | "bottom" => {
		return state.hasChatSession ? "bottom" : "center";
	},

	showLogFileChip: (state: ApplicationState): boolean => {
		return !state.hasChatSession && state.logFileState === "attached";
	},

	showAttachmentIndicator: (state: ApplicationState): boolean => {
		return state.hasChatSession && state.logFileState === "attached";
	},
};

// Initial state
export const initialState: ApplicationState = {
	apiKey: localStorage.getItem("gemini-api-key") || "",
	analyzer: null,
	logFileState: "none",
	apiKeyState: "missing",
	userQueryState: "empty",
	uiState: "initial",
	processedLogs: null,
	currentQuery: "",
	attachedFileName: "",
	messages: [],
	currentResponse: "",
	hasChatSession: false,
	isFirstResponse: false,
	firstResponseStartTime: null,
	tokenCounts: {
		systemPrompt: 0,
		logFile: 0,
		userQuery: 0,
		total: 0,
	},
	settingsOpen: false,
	error: "",
	resetKey: 0,
};
