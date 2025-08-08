import React, { useRef, useState, useCallback } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  styled
} from '@mui/material';
import { CloudUpload, Description } from '@mui/icons-material';

interface LogUploadProps {
  onFileSelect: (content: string, filename: string) => void;
  disabled?: boolean;
}

const DropZone = styled(Paper)<{ isDragOver: boolean; disabled: boolean }>(
  ({ theme, isDragOver, disabled }) => ({
    border: `2px dashed ${isDragOver ? theme.palette.primary.main : theme.palette.divider}`,
    backgroundColor: isDragOver ? theme.palette.action.hover : 'transparent',
    padding: theme.spacing(2.8), // Reduced from 4 to 2.8 (30% reduction)
    textAlign: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.3s ease',
    '&:hover': {
      borderColor: disabled ? theme.palette.divider : theme.palette.primary.main,
      backgroundColor: disabled ? 'transparent' : theme.palette.action.hover,
    }
  })
);

export const LogUpload: React.FC<LogUploadProps> = ({ onFileSelect, disabled = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileSelect(content, file.name);
    };
    reader.readAsText(file);
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileRead(file);
    }
  }, [handleFileRead]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileRead(file);
    }
  }, [handleFileRead, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  return (
    <Box sx={{ p: 2 }}>
      <DropZone
        isDragOver={isDragOver}
        disabled={disabled}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        elevation={0}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".log,.txt"
          onChange={handleFileInput}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.4 }}>
          {isDragOver ? (
            <CloudUpload sx={{ fontSize: 34, color: 'primary.main' }} />
          ) : (
            <Description sx={{ fontSize: 34, color: 'text.secondary' }} />
          )}
          
          <Typography variant="h6" color={isDragOver ? 'primary' : 'textPrimary'}>
            {isDragOver ? 'Drop your log file here' : 'Upload file or drag & drop'}
          </Typography>
        </Box>
      </DropZone>
    </Box>
  );
};
