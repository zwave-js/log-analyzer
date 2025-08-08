# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

# AI-Powered Z-Wave JS Log Analyzer

A web-based application that uses Google's Gemini AI to analyze Z-Wave JS network logs and provide intelligent insights about network performance, device behavior, and potential issues.

## Features

- **Smart Log Processing**: Real transform pipeline based on Z-Wave JS code for accurate log parsing
- **AI-Powered Analysis**: Google Gemini AI provides intelligent insights about your Z-Wave network
- **RSSI Analysis**: Specialized analysis of signal strength and network quality
- **Interactive UI**: Modern React interface with drag-and-drop file upload
- **Real-time Streaming**: Live analysis results as they're generated
- **Secure**: API keys stored locally in your browser, no data sent to external servers

## Live Demo

Visit the live application at: [https://username.github.io/zwave-js-log-analyzer/](https://username.github.io/zwave-js-log-analyzer/)

## Usage

1. **Get a Google Gemini API Key**
   - Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create a free API key
   - Enter it in the application (stored locally in your browser)

2. **Upload Your Z-Wave JS Log File**
   - Drag and drop your log file onto the upload area
   - Supports .log and .txt files from Z-Wave JS applications

3. **Ask Questions About Your Network**
   - Use the default query or ask specific questions
   - Examples:
     - "How good are the connections of my devices?"
     - "What errors occurred in this log?"
     - "Which devices have communication issues?"
     - "Analyze the RSSI values and signal quality"

4. **Review AI Analysis**
   - Get real-time insights as the AI analyzes your log
   - Receive actionable recommendations for network optimization

## Supported Log Formats

- Z-Wave JS structured logs (preferred)
- Raw Z-Wave JS console output  
- Log files from Z-Wave JS applications

## Local Development

### Prerequisites

- Node.js 18 or higher
- npm

### Installation

```bash
git clone https://github.com/username/zwave-js-log-analyzer.git
cd zwave-js-log-analyzer
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

The built application will be in the `dist` directory.

## Deployment

This application is configured for GitHub Pages deployment. Push to the `main` branch to automatically deploy via GitHub Actions.

### Manual Deployment

```bash
npm run build
# Deploy the contents of the dist/ directory to your web server
```

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **AI Integration**: Google Gemini AI via @google/genai
- **Log Processing**: Transform pipeline based on Z-Wave JS core
- **State Management**: React hooks with localStorage for persistence

## Privacy & Security

- **Local Processing**: Log files are processed entirely in your browser
- **API Key Storage**: Your Gemini API key is stored locally in your browser
- **No Data Collection**: No log data or personal information is sent to external servers
- **Client-Side Only**: This is a static web application with no backend

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built using the real Z-Wave JS transform pipeline from [node-zwave-js](https://github.com/zwave-js/node-zwave-js)
- Powered by Google's Gemini AI
- Analysis prompts based on Z-Wave JS project's log analysis tools

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
