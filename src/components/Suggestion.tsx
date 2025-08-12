import React from "react";
import { Button } from "@mui/material";

interface SuggestionProps {
	text: string;
	onClick: (suggestion: string) => void;
}

export const Suggestion: React.FC<SuggestionProps> = ({ text, onClick }) => {
	return (
		<Button
			variant="outlined"
			onClick={() => onClick(text)}
			sx={{
				borderRadius: 6,
				textTransform: "none",
				borderColor: "divider",
				color: "text.secondary",
				py: 1,
				px: 2.5,
				fontSize: "0.855rem",
				fontWeight: "normal",
				lineHeight: 1.2,
				"&:hover": {
					borderColor: "text.secondary",
					bgcolor: "action.hover",
				},
			}}
		>
			{text}
		</Button>
	);
};
