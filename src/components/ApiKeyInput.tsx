import React, { useState } from 'react';
import { 
  Button, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  TextField,
  Typography,
  Box,
  Link
} from '@mui/material';

interface ApiKeyInputProps {
  value: string;
  onChange: (apiKey: string) => void;
  open?: boolean;
  onClose?: () => void;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ 
  value, 
  onChange, 
  open: externalOpen = false,
  onClose: externalOnClose 
}) => {
  const [localValue, setLocalValue] = useState(value);

  const isOpen = externalOpen;
  
  const handleClose = () => {
    if (externalOnClose) {
      externalOnClose();
    }
  };

  const handleSave = () => {
    onChange(localValue);
    handleClose();
  };

  // Update local value when external value changes
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>API Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" paragraph>
            The log analyzer needs an AI model with large context to analyze logs (Gemini 2.5 Pro). 
            Because providing this would be too expensive, it uses a bring-your-own-key approach. 
            Free API keys are available at{' '}
            <Link 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              https://aistudio.google.com/app/apikey
            </Link>
          </Typography>
        </Box>
        <TextField
          fullWidth
          label="Google Gemini API Key"
          type="password"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          placeholder="Enter your API key"
          variant="outlined"
          helperText="Your API key is stored locally and never sent to our servers"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
};
