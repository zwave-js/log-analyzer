import React, { useState, useEffect } from "react";
import { Box, Paper, CircularProgress, Typography } from "@mui/material";

// Fun loading phrases that change every 5 seconds
const loadingPhrases = [
	"Thinking...",
	"Analyzing...",
	"Processing...",
	"Computing...",
	"Investigating...",
	"Examining...",
	"Parsing logs...",
	"Decoding signals...",
	"Reading patterns...",
	"Summoning AI magic...",
	"Consulting the RF wizards...",
	"Surfing the Z-Wave...",
	"Diving into mesh networks...",
	"Untangling radio waves...",
	"Channeling digital spirits...",
	"Brewing some algorithms...",
	"Connecting the dots...",
	"Following the breadcrumbs...",
	"Chasing radio ghosts...",
	"Deciphering the matrix...",
	"Riding the wavelength...",
	"Spelunking through data...",
	"Fishing for insights...",
	"Mining for nuggets...",
	"Weaving the narrative...",
];

export const LoadingIndicator: React.FC = () => {
	const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentPhraseIndex((prev) => (prev + 1) % loadingPhrases.length);
		}, 5000); // Change phrase every 5 seconds

		return () => clearInterval(interval);
	}, []);

	return (
		<Box sx={{ mb: 3, display: "flex", alignItems: "flex-start" }}>
			<Paper
				sx={{
					p: 3,
					bgcolor: "background.paper",
					borderRadius: 3,
					border: "1px solid",
					borderColor: "divider",
					display: "flex",
					alignItems: "center",
					gap: 2,
					backgroundImage: "none",
				}}
			>
				<CircularProgress size={20} sx={{ color: "primary.main" }} />
				<Typography>{loadingPhrases[currentPhraseIndex]}</Typography>
			</Paper>
		</Box>
	);
};
