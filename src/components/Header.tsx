import React from "react";
import { Box, Typography, IconButton, Button } from "@mui/material";
import { Settings, Add } from "@mui/icons-material";
import Logo from "../assets/logo.svg?react";
import GithubLogo from "../assets/github.svg?react";

// Z-Wave Logo component using the downloaded logo
const ZWaveLogo = () => (
  <Logo
    style={{
      fill: "white",
      verticalAlign: "middle",
      height: "52px",
      width: "auto",
      marginRight: "12px",
    }}
  />
);

interface HeaderProps {
  onOpenSettings?: () => void;
  onNewChat?: () => void;
  showNewChat?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onNewChat,
  showNewChat,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        py: 2,
        px: 3,
        bgcolor: "background.default",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <ZWaveLogo />
          <Typography
            variant="h6"
            component="h1"
            sx={{
              fontWeight: 400,
              fontSize: "1.35rem",
              marginTop: "0.5rem",
              fontFamily:
                "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
              color: "text.primary",
            }}
          >
            Log Analyzer
          </Typography>
        </Box>
        {showNewChat && onNewChat && (
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={onNewChat}
            sx={{
              borderRadius: 2,
              textTransform: "none",
              borderColor: "divider",
              color: "text.secondary",
              "&:hover": {
                borderColor: "text.secondary",
                bgcolor: "action.hover",
              },
            }}
          >
            New chat
          </Button>
        )}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {onOpenSettings && (
          <IconButton
            onClick={onOpenSettings}
            sx={{ color: "text.primary" }}
            title="Settings"
          >
            <Settings style={{ height: 20, width: "auto" }} />
          </IconButton>
        )}
        <IconButton
          color="inherit"
          href="https://github.com/zwave-js/log-analyzer"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: "text.primary" }}
          title="GitHub Repository"
        >
          <GithubLogo style={{ height: 20, width: "auto" }} />
        </IconButton>
      </Box>
    </Box>
  );
};
