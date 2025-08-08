import React from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';

interface ProcessingStatusProps {
  status: string;
  isProcessing?: boolean;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ 
  status, 
  isProcessing = false 
}) => {
  if (!status && !isProcessing) return null;

  return (
    <Box sx={{ p: 2 }}>
      <Alert 
        severity={isProcessing ? 'info' : 'success'}
        icon={isProcessing ? <CircularProgress size={20} /> : undefined}
      >
        <Typography variant="body2">
          {status}
        </Typography>
      </Alert>
    </Box>
  );
};
