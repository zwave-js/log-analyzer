import React from "react";
import { Box, Typography } from "@mui/material";

const AttachmentIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		stroke="currentColor"
		strokeWidth="2"
	>
		<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.64 16.2a2 2 0 01-2.83-2.83l8.49-8.49" />
	</svg>
);

interface DragOverlayProps {
	visible: boolean;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ visible }) => {
	if (!visible) return null;

	return (
		<Box
			sx={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				bgcolor: "rgba(100, 108, 255, 0.1)",
				border: "2px dashed",
				borderColor: "primary.main",
				borderRadius: 2,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
				backdropFilter: "blur(2px)",
			}}
		>
			<Box sx={{ textAlign: "center" }}>
				<AttachmentIcon />
				<Typography variant="h6" sx={{ mt: 2, color: "primary.main" }}>
					Drop your log file here
				</Typography>
			</Box>
		</Box>
	);
};
