import type { ApplicationState, AppAction } from './app-state';

export function appReducer(state: ApplicationState, action: AppAction): ApplicationState {
  switch (action.type) {
    case 'SET_API_KEY': {
      const newState = {
        ...state,
        apiKey: action.payload,
        apiKeyState: action.payload ? 'uploading-system-prompt' as const : 'missing' as const
      };
      localStorage.setItem('gemini-api-key', action.payload);
      return newState;
    }

    case 'SET_ANALYZER':
      return {
        ...state,
        analyzer: action.payload,
        apiKeyState: action.payload ? 'exists' : 'missing'
      };

    case 'SET_LOG_FILE_STATE':
      return {
        ...state,
        logFileState: action.payload
      };

    case 'SET_API_KEY_STATE':
      return {
        ...state,
        apiKeyState: action.payload
      };

    case 'SET_UI_STATE':
      return {
        ...state,
        uiState: action.payload
      };

    case 'SET_PROCESSED_LOGS':
      return {
        ...state,
        processedLogs: action.payload
      };

    case 'SET_CURRENT_QUERY': {
      const newState = {
        ...state,
        currentQuery: action.payload,
        userQueryState: action.payload.trim() ? 'not-empty' as const : 'empty' as const
      };
      
      // Update user query token count (simple estimation)
      const userQueryTokens = action.payload.length > 0 ? Math.max(1, Math.floor(action.payload.length / 4)) : 0;
      newState.tokenCounts = {
        ...newState.tokenCounts,
        userQuery: userQueryTokens,
        total: newState.tokenCounts.systemPrompt + newState.tokenCounts.logFile + userQueryTokens
      };
      
      return newState;
    }

    case 'SET_ATTACHED_FILE_NAME':
      return {
        ...state,
        attachedFileName: action.payload
      };

    case 'ADD_MESSAGE': {
      return {
        ...state,
        messages: [...state.messages, action.payload],
        uiState: action.payload.type === 'user' ? 'waiting-for-ai-response' : state.uiState,
        isFirstResponse: action.payload.type === 'user' && state.messages.length === 0
      };
    }

    case 'UPDATE_CURRENT_RESPONSE':
      return {
        ...state,
        currentResponse: action.payload,
        uiState: 'ai-responding'
      };

    case 'FINISH_RESPONSE': {
      const assistantMessage = {
        id: Date.now().toString() + '_ai',
        type: 'assistant' as const,
        content: state.currentResponse,
        timestamp: new Date()
      };
      
      return {
        ...state,
        messages: [...state.messages, assistantMessage],
        currentResponse: '',
        uiState: 'idle',
        currentQuery: '',
        userQueryState: 'empty',
        isFirstResponse: false,
        firstResponseStartTime: null,
        tokenCounts: {
          ...state.tokenCounts,
          userQuery: 0,
          total: state.tokenCounts.systemPrompt + state.tokenCounts.logFile
        }
      };
    }

    case 'UPDATE_TOKEN_COUNTS': {
      const newTokenCounts = {
        ...state.tokenCounts,
        ...action.payload
      };
      newTokenCounts.total = newTokenCounts.systemPrompt + newTokenCounts.logFile + newTokenCounts.userQuery;
      
      return {
        ...state,
        tokenCounts: newTokenCounts
      };
    }

    case 'SET_SETTINGS_OPEN':
      return {
        ...state,
        settingsOpen: action.payload
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: ''
      };

    case 'NEW_CHAT':
      return {
        ...state,
        logFileState: 'none',
        processedLogs: null,
        messages: [],
        currentResponse: '',
        uiState: 'initial',
        currentQuery: '',
        userQueryState: 'empty',
        attachedFileName: '',
        hasChatSession: false,
        isFirstResponse: false,
        firstResponseStartTime: null,
        error: '',
        resetKey: state.resetKey + 1,
        tokenCounts: {
          systemPrompt: state.tokenCounts.systemPrompt,
          logFile: 0,
          userQuery: 0,
          total: state.tokenCounts.systemPrompt
        }
      };

    case 'START_CHAT_SESSION':
      return {
        ...state,
        hasChatSession: true,
        uiState: 'waiting-for-ai-response'
      };

    case 'END_CHAT_SESSION':
      return {
        ...state,
        hasChatSession: false
      };

    case 'START_FIRST_RESPONSE':
      return {
        ...state,
        firstResponseStartTime: Date.now()
      };

    default:
      return state;
  }
}
