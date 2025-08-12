import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Paper, Typography, Button, Alert } from "@mui/material";
import { Warning } from "@mui/icons-material";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("Uncaught error:", error, errorInfo);
	}

	public render() {
		if (this.state.hasError) {
			return (
				<Box
					sx={{
						minHeight: "100vh",
						bgcolor: "background.default",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						p: 2,
					}}
				>
					<Paper sx={{ p: 4, maxWidth: 400 }}>
						<Alert
							severity="error"
							icon={<Warning />}
							sx={{ mb: 3 }}
						>
							<Typography variant="h6">
								Something went wrong
							</Typography>
						</Alert>

						<Typography variant="body1" sx={{ mb: 3 }}>
							An unexpected error occurred. Please refresh the
							page and try again.
						</Typography>

						{this.state.error && (
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mb: 3 }}
							>
								Error: {this.state.error.message}
							</Typography>
						)}

						<Button
							variant="contained"
							fullWidth
							onClick={() => window.location.reload()}
						>
							Refresh Page
						</Button>
					</Paper>
				</Box>
			);
		}

		return this.props.children;
	}
}
