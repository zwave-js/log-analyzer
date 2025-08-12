import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import type { ChatMessage as ChatMessageType } from "../lib/app-state";

interface ChatMessageProps {
	message:
		| ChatMessageType
		| { id: string; type: "assistant"; content: string; timestamp: Date };
	isLast?: boolean;
	isFirstUserMessage?: boolean;
}

const PaperclipIcon = () => (
	<svg
		width="12"
		height="12"
		viewBox="0 0 24 24"
		stroke="currentColor"
		strokeWidth="2"
		fill="none"
	>
		<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.64 16.2a2 2 0 01-2.83-2.83l8.49-8.49" />
	</svg>
);

export const ChatMessage: React.FC<ChatMessageProps> = ({
	message,
	isLast = false,
	isFirstUserMessage = false,
}) => {
	return (
		<Box
			sx={{
				mb: isLast ? 8 : 3,
				display: "flex",
				flexDirection: "column",
				alignItems: message.type === "user" ? "flex-end" : "flex-start",
				ml: message.type === "user" ? 8 : 0,
				mr: message.type === "assistant" ? 8 : 0,
			}}
		>
			<Paper
				sx={{
					px: 2,
					py: message.type === "user" ? 2 : 0, // ReactMarkdown paragraphs start with margin
					maxWidth: "80%",
					bgcolor:
						message.type === "user"
							? "primary.main"
							: "background.paper",
					color:
						message.type === "user"
							? "primary.contrastText"
							: "text.primary",
					borderRadius: 3,
					border: message.type === "assistant" ? "1px solid" : "none",
					borderColor: "divider",
					boxShadow:
						message.type === "user"
							? "0 2px 8px rgba(100, 108, 255, 0.2)"
							: "none",
					backgroundImage: "none",
				}}
			>
				{message.type === "assistant" ? (
					<ReactMarkdown>{message.content}</ReactMarkdown>
				) : (
					<Typography>{message.content}</Typography>
				)}

				{/* Show attachment indicator only for the first user message */}
				{message.type === "user" &&
					isFirstUserMessage &&
					(message as ChatMessageType).attachedFileName && (
						<Box
							sx={{
								mt: 1,
								mb: -1,
								display: "flex",
								alignItems: "center",
								gap: 0.5,
								//opacity: 0.7,
								fontSize: "0.75rem",
							}}
						>
							<PaperclipIcon />
							<Typography
								variant="caption"
								sx={{ fontSize: "0.7rem" }}
							>
								{(message as ChatMessageType).attachedFileName}
							</Typography>
						</Box>
					)}
			</Paper>
		</Box>
	);
};
