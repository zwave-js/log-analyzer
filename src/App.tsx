import { CssBaseline, ThemeProvider, createTheme, Box } from "@mui/material";
import { Header } from "./components/Header";
import { ApiKeyInput } from "./components/ApiKeyInput";
import { ChatInterface } from "./components/ChatInterface";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppState } from "./lib/use-app-state";

const darkTheme = createTheme({
	palette: {
		mode: "dark",
		primary: {
			main: "#646cff",
		},
		secondary: {
			main: "#535bf2",
		},
		background: {
			default: "#0d1117",
			paper: "#161b22",
		},
		text: {
			primary: "#f0f6fc",
			secondary: "#8b949e",
		},
		divider: "#30363d",
	},
	typography: {
		fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
	},
	components: {
		MuiTextField: {
			styleOverrides: {
				root: {
					"& .MuiOutlinedInput-root": {
						backgroundColor: "#0d1117",
						"& fieldset": {
							borderColor: "#30363d",
						},
						"&:hover fieldset": {
							borderColor: "#8b949e",
						},
						"&.Mui-focused fieldset": {
							borderColor: "#646cff",
						},
					},
				},
			},
		},
		MuiPaper: {
			styleOverrides: {
				root: {
					backgroundImage: "none",
					border: "1px solid #30363d",
				},
			},
		},
		MuiButton: {
			styleOverrides: {
				outlined: {
					borderColor: "#30363d",
					color: "#8b949e",
					"&:hover": {
						borderColor: "#8b949e",
						backgroundColor: "rgba(255, 255, 255, 0.08)",
					},
				},
			},
		},
	},
});

function App() {
	const { state, actions, selectors } = useAppState();

	return (
		<ThemeProvider theme={darkTheme}>
			<CssBaseline />
			<ErrorBoundary>
				<Box
					sx={{
						minHeight: "100vh",
						bgcolor: "background.default",
						position: "relative",
					}}
				>
					<Header
						onOpenSettings={actions.openSettings}
						onNewChat={undefined}
						showNewChat={false}
					/>

					<ApiKeyInput
						value={state.apiKey}
						onChange={actions.setApiKey}
						open={state.settingsOpen}
						onClose={actions.closeSettings}
					/>

					<ChatInterface
						state={state}
						canSendMessage={selectors.canSendMessage}
						isUploading={selectors.isUploading}
						hasStartedChat={selectors.hasStartedChat}
						inputBoxPosition={selectors.inputBoxPosition}
						onQueryChange={actions.setCurrentQuery}
						onFileUpload={actions.uploadLogFile}
						onFileRemove={actions.removeLogFile}
						onSendMessage={actions.sendMessage}
						onOpenSettings={actions.openSettings}
						onNewChat={actions.newChat}
					/>

					{/* Error Display */}
					{state.error && (
						<Box
							sx={{
								position: "fixed",
								bottom: 16,
								right: 16,
								bgcolor: "error.main",
								color: "error.contrastText",
								p: 2,
								borderRadius: 2,
								maxWidth: 400,
								zIndex: 1001,
								cursor: "pointer",
							}}
							onClick={actions.clearError}
						>
							{state.error}
						</Box>
					)}
				</Box>
			</ErrorBoundary>
		</ThemeProvider>
	);
}

export default App;
