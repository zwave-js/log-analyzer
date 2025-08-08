import React, { useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField, 
  Button, 
  CircularProgress,
  Chip
} from '@mui/material';
import { Settings } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import type { TransformedLog } from '../lib/types';

// Sparkles AI icon component
const SparklesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9.5 2L8.5 5.5L5 6.5L8.5 7.5L9.5 11L10.5 7.5L14 6.5L10.5 5.5L9.5 2Z"/>
    <path d="M19 8L18 10.5L15.5 11.5L18 12.5L19 15L20 12.5L22.5 11.5L20 10.5L19 8Z"/>
    <path d="M16.5 2L15.75 4.25L13.5 5L15.75 5.75L16.5 8L17.25 5.75L19.5 5L17.25 4.25L16.5 2Z"/>
    <path d="M5 16L4.25 18.25L2 19L4.25 19.75L5 22L5.75 19.75L8 19L5.75 18.25L5 16Z"/>
  </svg>
);

interface LogAnalysisProps {
  logs: TransformedLog | null;
  analysis: string;
  onAnalyze: (query: string) => void;
  isAnalyzing: boolean;
  disabled: boolean;
  onOpenSettings: () => void;
}

export const LogAnalysis: React.FC<LogAnalysisProps> = ({
  analysis,
  onAnalyze,
  isAnalyzing,
  disabled,
  onOpenSettings
}) => {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onAnalyze(query.trim());
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* User Input Section - Boxed */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            What do you want to know?
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Settings />}
            size="small"
            onClick={onOpenSettings}
          >
            Settings
          </Button>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Box sx={{ position: 'relative', mb: 2 }}>
            <TextField
              fullWidth
              multiline
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Is my network in good shape?"
              disabled={disabled}
              variant="outlined"
            />
            {/* Token Counter Overlay */}
            <Chip 
              label="Tokens: 456000 / 1000000" 
              size="small" 
              variant="outlined"
              sx={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                backgroundColor: 'background.paper',
                fontSize: '0.75rem'
              }}
            />
          </Box>
          <Button
            type="submit"
            variant="contained"
            disabled={disabled || !query.trim() || isAnalyzing}
            startIcon={isAnalyzing ? <CircularProgress size={16} /> : <SparklesIcon />}
            sx={{ 
              width: '200px',
              justifyContent: 'center',
              '& .MuiButton-startIcon': {
                marginRight: '8px',
                marginLeft: 0
              }
            }}
          >
            {isAnalyzing ? 'Analyzing...' : 'Ask AI'}
          </Button>
        </Box>
      </Paper>

      {/* AI Response Section - Flat on page */}
      {(isAnalyzing || analysis) && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            AI Response
          </Typography>
          
          <Box 
            sx={{ 
              minHeight: '300px',
              p: 2,
              backgroundColor: 'transparent'
            }}
          >
            {isAnalyzing ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Analyzing log file...</Typography>
              </Box>
            ) : analysis ? (
              <ReactMarkdown>{analysis}</ReactMarkdown>
            ) : null}
          </Box>
        </Box>
      )}
    </Box>
  );
};
