import React, { useState, useEffect } from "react";
import { Box, Paper, Typography } from "@mui/material";

interface RateLimitNotificationProps {
	retryAfter: number | null; // Unix timestamp when rate limit will be lifted
}

export const RateLimitNotification: React.FC<RateLimitNotificationProps> = ({
	retryAfter
}) => {
	const [timeLeft, setTimeLeft] = useState(0);

	useEffect(() => {
		if (!retryAfter) return;

		const updateTimeLeft = () => {
			const remaining = Math.max(0, retryAfter - Date.now());
			setTimeLeft(remaining);
		};

		// Update immediately
		updateTimeLeft();

		// Update every second
		const interval = setInterval(updateTimeLeft, 1000);

		return () => clearInterval(interval);
	}, [retryAfter]);

	const secondsLeft = Math.ceil(timeLeft / 1000);

	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				mb: 2,
			}}
		>
			<Paper
				sx={{
					p: 2,
					bgcolor: "warning.dark",
					color: "warning.contrastText",
					borderRadius: 2,
					maxWidth: 500,
					textAlign: "center",
				}}
			>
				<Typography variant="body2">
					Rate limited by Gemini API.
					{retryAfter && secondsLeft > 0 && (
						<>
							<br />
							You can try again in{" "}
							<strong>
								{secondsLeft} second{secondsLeft !== 1 ? 's' : ''}
							</strong>.
						</>
					)}
				</Typography>
			</Paper>
		</Box>
	);
};
