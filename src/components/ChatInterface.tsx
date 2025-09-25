import React, { useState, useRef, useCallback, useEffect } from "react";
import {
	Box,
	TextField,
	Button,
	Typography,
	Paper,
	IconButton,
	Tooltip,
} from "@mui/material";
import type { ApplicationState } from "../lib/app-state";
import { ChatMessage } from "./ChatMessage";
import { AttachmentIndicator } from "./AttachmentIndicator";
import { Suggestion } from "./Suggestion";
import { LoadingIndicator } from "./LoadingIndicator";
import { DragOverlay } from "./DragOverlay";
import { FirstResponseIndicator } from "./FirstResponseIndicator";
import { RateLimitNotification } from "./RateLimitNotification";

interface ChatInterfaceProps {
	state: ApplicationState;
	canSendMessage: boolean;
	isUploading: boolean;
	hasStartedChat: boolean;
	inputBoxPosition: "center" | "bottom";
	onQueryChange: (query: string) => void;
	onFileUpload: (content: string, filename: string) => Promise<boolean>;
	onFileRemove: () => void;
	onSendMessage: (query: string) => void;
	onOpenSettings: () => void;
	onNewChat: () => void;
}

const SendIcon = () => (
	<svg
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="currentColor"
		style={{ transform: "translateX(1px)" }}
	>
		<path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
	</svg>
);

// Dynamic greeting phrases
const greetingPhrases = [
	"How can I help you today?",
	"Ready to catch some Z-Wave waves?",
	"What's riding the Z-Wave today?",
	"Wanna surf through your Z-Wave logs?",
	"How can I analyze your waves?",
	"Ready to dive into Z-Wave waters?",
	"What Z-Wave mysteries shall we uncover?",
	"Let's ride the Z-Wave together!",
	"How can I help decode your mesh?",
];

// Function to get a random greeting (changes when resetKey changes)
const getRandomGreeting = (resetKey: number) => {
	const savedGreeting = sessionStorage.getItem(`zwave-greeting-${resetKey}`);
	if (savedGreeting) {
		return savedGreeting;
	}
	const randomGreeting =
		greetingPhrases[Math.floor(Math.random() * greetingPhrases.length)];
	sessionStorage.setItem(`zwave-greeting-${resetKey}`, randomGreeting);
	return randomGreeting;
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
	state,
	canSendMessage,
	isUploading,
	hasStartedChat,
	inputBoxPosition,
	onQueryChange,
	onFileUpload,
	onFileRemove,
	onSendMessage,
	onOpenSettings,
	onNewChat,
}) => {
	const [isDragOver, setIsDragOver] = useState(false);
	const [greeting, setGreeting] = useState(() =>
		getRandomGreeting(state.resetKey),
	);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const chatContainerRef = useRef<HTMLDivElement>(null);

	// Update greeting when resetKey changes (new chat)
	useEffect(() => {
		setGreeting(getRandomGreeting(state.resetKey));
	}, [state.resetKey]);

	const suggestions = [
		"Is my Z-Wave network in good shape?",
		"Why is my automated heating system randomly turning on?",
		"Are any devices flooding my network?",
	];

	const handleFileInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = (e) => {
					const content = e.target?.result as string;
					onFileUpload(content, file.name);
				};
				reader.readAsText(file);
			}
		},
		[onFileUpload],
	);

	const handleAttachClick = () => {
		fileInputRef.current?.click();
	};

	const handleRemoveFile = () => {
		onFileRemove();
		// Reset file input
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	// Drag and drop handlers
	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.currentTarget === e.target) {
			setIsDragOver(false);
		}
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			const file = e.dataTransfer.files[0];
			if (
				file &&
				(file.name.endsWith(".log") || file.name.endsWith(".txt"))
			) {
				const reader = new FileReader();
				reader.onload = (e) => {
					const content = e.target?.result as string;
					onFileUpload(content, file.name);
				};
				reader.readAsText(file);
			}
		},
		[onFileUpload],
	);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (state.currentQuery.trim() && canSendMessage) {
			const query = state.currentQuery.trim();
			onSendMessage(query);
			// Clear the input immediately after submitting
			onQueryChange("");
			// Note: We don't call onFileRemove here anymore!
			// The attachment indicator will automatically hide the remove button
			// once chatSessionActive becomes true, but the file stays attached
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			if (e.ctrlKey) {
				// CTRL+Enter: Insert newline (don't submit)
				e.preventDefault();
				const textarea = e.target as HTMLTextAreaElement;
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const currentValue = state.currentQuery;
				const newValue =
					currentValue.substring(0, start) +
					"\n" +
					currentValue.substring(end);
				onQueryChange(newValue);

				// Reset cursor position after the newline
				setTimeout(() => {
					textarea.selectionStart = textarea.selectionEnd = start + 1;
				}, 0);
			} else if (!e.shiftKey) {
				// Regular Enter: Submit form (if valid)
				e.preventDefault();
				if (state.currentQuery.trim() && canSendMessage) {
					// Directly call the submit logic
					const query = state.currentQuery.trim();
					onSendMessage(query);
					onQueryChange("");
				}
			}
			// Shift+Enter: Default behavior (newline)
		}
	};

	const handleSuggestionClick = (suggestion: string) => {
		onQueryChange(suggestion);
	};

	// Get all messages to display (including current streaming response)
	const displayMessages = [...state.messages];
	if (state.uiState === "ai-responding" && state.currentResponse) {
		displayMessages.push({
			id: "streaming",
			type: "assistant" as const,
			content: state.currentResponse,
			timestamp: new Date(),
		});
	}

	// Auto-scroll to bottom when new messages arrive or AI is responding
	useEffect(() => {
		if (chatContainerRef.current && hasStartedChat) {
			const scrollElement = chatContainerRef.current;
			scrollElement.scrollTop = scrollElement.scrollHeight;
		}
	}, [
		displayMessages.length,
		state.currentResponse,
		state.uiState,
		hasStartedChat,
	]);

	return (
		<Box
			sx={{
				minHeight: "calc(100vh - 120px)",
				display: "flex",
				flexDirection: "column",
				position: "relative",
			}}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onDragEnter={(e) => e.preventDefault()}
		>
			<DragOverlay visible={isDragOver} />

			{/* API Key hint */}
			{state.apiKeyState === "missing" && !hasStartedChat && (
				<Box
					sx={{
						position: "absolute",
						top: 20,
						left: "50%",
						transform: "translateX(-50%)",
						zIndex: 10,
					}}
				>
					<Button
						variant="outlined"
						onClick={onOpenSettings}
						sx={{
							borderRadius: 3,
							textTransform: "none",
							borderColor: "warning.main",
							color: "warning.main",
							bgcolor: "rgba(255, 152, 0, 0.1)",
							"&:hover": {
								borderColor: "warning.light",
								bgcolor: "rgba(255, 152, 0, 0.2)",
							},
						}}
					>
						⚠️ Configure API key to get started
					</Button>
				</Box>
			)}

			{/* Chat Messages */}
			{hasStartedChat && (
				<Box
					ref={chatContainerRef}
					sx={{
						flex: 1,
						px: 2,
						// Limit height to prevent messages from appearing below input
						maxHeight: "calc(100vh - 200px)",
						overflowY: "auto",
						pb: 8,
						maxWidth: "800px",
						mx: "auto",
						width: "100%",
					}}
				>
					{displayMessages.map((message, index) => {
						// Find the first user message to show attachment indicator
						const isFirstUserMessage =
							message.type === "user" &&
							displayMessages
								.slice(0, index + 1)
								.filter((m) => m.type === "user").length === 1;

						return (
							<ChatMessage
								key={message.id}
								message={message}
								isLast={index === displayMessages.length - 1}
								isFirstUserMessage={isFirstUserMessage}
							/>
						);
					})}

					{/* Show waiting state */}
					{state.uiState === "waiting-for-ai-response" && (
						<>
							<LoadingIndicator />
							{/* Show progressive message for first response */}
							{state.isFirstResponse &&
								state.firstResponseStartTime && (
									<FirstResponseIndicator
										startTime={state.firstResponseStartTime}
									/>
								)}
						</>
					)}

					{/* Show rate limit notification */}
					{state.isRateLimited && (
						<RateLimitNotification retryAfter={state.rateLimitRetryAfter} />
					)}

					{/* New Chat Button - show after AI responses in chat area */}
					{hasStartedChat &&
						state.uiState === "idle" &&
						displayMessages.length > 0 &&
						displayMessages[displayMessages.length - 1].type ===
							"assistant" && (
							<Box
								sx={{
									display: "flex",
									justifyContent: "center",
									mb: 8,
								}}
							>
								<Button
									variant="outlined"
									onClick={onNewChat}
									sx={{
										borderRadius: "999em",
										textTransform: "none",
										fontSize: "0.875rem",
										py: 1,
										px: 3,
										borderColor: "divider",
										color: "text.secondary",
										"&:hover": {
											borderColor: "text.secondary",
											bgcolor: "action.hover",
										},
									}}
								>
									Analyze another log
								</Button>
							</Box>
						)}
				</Box>
			)}

			{/* Input Box Container */}
			<Box
				sx={{
					position:
						inputBoxPosition === "center" ? "absolute" : "fixed",
					bottom: inputBoxPosition === "center" ? "auto" : 32,
					left: "50%",
					transform:
						inputBoxPosition === "center"
							? "translate(-50%, -50%)"
							: "translateX(-50%)",
					top: inputBoxPosition === "center" ? "50%" : "auto",
					width: "100%",
					maxWidth: hasStartedChat ? "800px" : "600px", // Match chat area width when started
					px: 2,
					zIndex: 10,
				}}
			>
				{/* Title - only show when centered */}
				{!hasStartedChat && (
					<Typography
						variant="h3"
						component="h1"
						sx={{
							textAlign: "center",
							mb: 6,
							fontWeight: 400,
							fontSize: "2.5rem",
							color: "text.primary",
						}}
					>
						{greeting}
					</Typography>
				)}

				{/* Input Box */}
				<Paper
					component="form"
					onSubmit={handleSubmit}
					sx={{
						borderRadius: 3,
						border: "1px solid",
						borderColor: "divider",
						bgcolor: "background.paper",
						position: "relative",
						mb: hasStartedChat ? 0 : 4,
						boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
						overflow: "hidden",
					}}
				>
					{/* Main input area */}
					<Box sx={{ px: 2, pb: 0 }}>
						<TextField
							value={state.currentQuery}
							onChange={(e) => onQueryChange(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={
								hasStartedChat
									? "What else do you want to know?"
									: "Ask a question about your Z-Wave logs..."
							}
							variant="standard"
							multiline
							maxRows={6}
							fullWidth
							sx={{
								"& .MuiInput-underline:before": {
									display: "none",
								},
								"& .MuiInput-underline:after": {
									display: "none",
								},
								"& .MuiInputBase-input": {
									fontSize: "1.15rem",
									pt: 2,
									minHeight: "24px",
								},
							}}
						/>
					</Box>

					{/* Bottom controls bar */}
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							px: 2,
							pb: 1,
							pt: 1,
						}}
					>
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 1,
							}}
						>
							<AttachmentIndicator
								fileName={state.attachedFileName}
								isUploading={isUploading}
								showAttachButton={
									!hasStartedChat && !state.hasChatSession
								}
								showRemoveButton={!state.hasChatSession}
								showLogFileChip={!hasStartedChat}
								onAttach={handleAttachClick}
								onRemove={handleRemoveFile}
							/>
						</Box>

						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 2,
							}}
						>
							{/* Send Button */}
							<Tooltip
								title={
									!canSendMessage
										? getDisabledReason(state)
										: ""
								}
								disableHoverListener={canSendMessage}
								arrow
							>
								<span>
									<IconButton
										type="submit"
										disabled={!canSendMessage}
										sx={{
											bgcolor:
												canSendMessage &&
												state.tokenCounts.total <=
													1000000
													? "primary.main"
													: state.tokenCounts.total >
														  1000000
														? "error.main"
														: "transparent",
											color:
												canSendMessage &&
												state.tokenCounts.total <=
													1000000
													? "primary.contrastText"
													: state.tokenCounts.total >
														  1000000
														? "error.contrastText"
														: "text.disabled",
											borderRadius: "50%",
											width: 40,
											height: 40,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											"&:hover": {
												bgcolor:
													canSendMessage &&
													state.tokenCounts.total <=
														1000000
														? "primary.dark"
														: state.tokenCounts
																	.total >
															  1000000
															? "error.dark"
															: "transparent",
											},
											"&:disabled": {
												bgcolor:
													state.tokenCounts.total >
													1000000
														? "error.main"
														: "transparent",
												color:
													state.tokenCounts.total >
													1000000
														? "error.contrastText"
														: "text.disabled",
											},
										}}
									>
										<SendIcon />
									</IconButton>
								</span>
							</Tooltip>
						</Box>
					</Box>

					<input
						ref={fileInputRef}
						type="file"
						accept=".log,.txt"
						onChange={handleFileInput}
						style={{ display: "none" }}
					/>
				</Paper>

				{/* Suggestions or Disclaimer */}
				{!hasStartedChat ? (
					<Box
						sx={{
							display: "flex",
							gap: 2,
							justifyContent: "center",
							flexWrap: "wrap",
						}}
					>
						{suggestions.map((suggestion, index) => (
							<Suggestion
								key={index}
								text={suggestion}
								onClick={handleSuggestionClick}
							/>
						))}
					</Box>
				) : (
					<Typography
						variant="body2"
						sx={{
							textAlign: "center",
							color: "text.secondary",
							mt: 2,
							fontSize: "0.8rem",
						}}
					>
						AI can make mistakes. Check important info, or{" "}
						<a
							href="https://github.com/zwave-js/zwave-js/discussions/new?category=request-support-investigate-issue"
							target="_blank"
						>
							ask us
						</a>{" "}
						for help!
					</Typography>
				)}
			</Box>
		</Box>
	);
};

// Helper function to get disabled reason
function getDisabledReason(state: ApplicationState): string {
	if (state.tokenCounts.total > 1000000) {
		return "The log file is too large to analyze";
	}
	if (state.apiKeyState !== "exists") {
		return "Please configure your API key first";
	}
	if (state.logFileState !== "attached") {
		return "Please attach a log file first";
	}
	if (state.userQueryState === "empty") {
		return "Please enter a question";
	}
	if (
		state.uiState === "waiting-for-ai-response" ||
		state.uiState === "ai-responding"
	) {
		return "Please wait for the current analysis to complete";
	}
	if (state.isRateLimited) {
		return "Rate limited. Please try again later";
	}
	return "";
}
