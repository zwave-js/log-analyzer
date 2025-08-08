import React from "react";
import { Button, Chip, CircularProgress } from "@mui/material";
import { Close } from "@mui/icons-material";

interface AttachmentIndicatorProps {
  fileName?: string;
  isUploading: boolean;
  showAttachButton: boolean;
  showRemoveButton?: boolean; // Control if remove button is shown
  showLogFileChip?: boolean; // Control if log file chip is shown in chat input
  onAttach: () => void;
  onRemove: () => void;
}

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

export const AttachmentIndicator: React.FC<AttachmentIndicatorProps> = ({
  fileName,
  isUploading,
  showAttachButton,
  showRemoveButton = true, // Default to true for backward compatibility
  showLogFileChip = true, // Default to true for backward compatibility
  onAttach,
  onRemove,
}) => {
  if (fileName && showLogFileChip) {
    return (
      <Chip
        label={isUploading ? "Uploading..." : fileName}
        onDelete={isUploading || !showRemoveButton ? undefined : onRemove}
        deleteIcon={
          isUploading || !showRemoveButton ? undefined : (
            <Close sx={{ fontSize: "16px" }} />
          )
        }
        icon={
          isUploading ? (
            <CircularProgress
              size={14}
              sx={{ color: "primary.contrastText" }}
            />
          ) : undefined
        }
        sx={{
          bgcolor: "grey.600",
          color: "white",
          maxWidth: "200px",
          height: "32px",
          display: "flex",
          alignItems: "center",
          "& .MuiChip-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "flex",
            alignItems: "center",
            lineHeight: 1,
          },
          "& .MuiChip-deleteIcon": {
            color: "white",
            fontSize: "16px",
            margin: "0 5px 0 0",
            "&:hover": {
              color: "white",
            },
          },
        }}
      />
    );
  }

  if (!showAttachButton) {
    return null;
  }

  return (
    <Button
      onClick={onAttach}
      variant="outlined"
      startIcon={<AttachmentIcon />}
      sx={{
        borderRadius: "999em",
        textTransform: "none",
        fontSize: "0.875rem",
        py: 0.5,
        px: 2,
        minHeight: 32,
        borderColor: "divider",
        color: "text.secondary",
        "&:hover": {
          borderColor: "text.secondary",
          bgcolor: "action.hover",
        },
      }}
    >
      Attach log
    </Button>
  );
};
