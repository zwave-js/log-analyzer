# Z-Wave JS Log Analyzer

AI powered log analyzer for Z-Wave JS. Helps you analyze Z-Wave JS logs by providing insights and suggestions, and answering your questions.

## Web Interface

Visit the site at [https://zwave-js.github.io/log-analyzer/](https://zwave-js.github.io/log-analyzer/) to get started with the web interface.

## Command Line Interface

You can also use the log analyzer from the command line:

### Usage

```bash
# Set your Gemini API key
export GEMINI_API_KEY="your-api-key-here"

# Analyze a log file
npx @zwave-js/log-analyzer /path/to/logfile.txt

# Ask a specific question about the log
npx @zwave-js/log-analyzer /path/to/logfile.txt --question "Why is node 5 not responding?"
```

### API Key

> [!NOTE]
> AI-powered log analysis require very large context windows up to 1 million tokens. To be able to provide this service, we need you to bring your own Gemini API key. You can get one for free at https://aistudio.google.com/app/apikey

## Library Usage

You can use this package as a library in your own Node.js applications.

### Installation

```bash
npm install -g @zwave-js/log-analyzer
```

### Usage

The `ZWaveLogAnalyzer` class provides a simple, high-level API:

```typescript
import { ZWaveLogAnalyzer } from "@zwave-js/log-analyzer";

// Initialize the analyzer with your API key
const analyzer = new ZWaveLogAnalyzer(process.env.GEMINI_API_KEY!);

// Analyze a log file and stream the results
for await (const chunk of analyzer.analyzeLogFile(
	"./logfile.txt",
	"Analyze this log file",
)) {
	process.stdout.write(chunk);
}

// Ask follow-up questions
for await (const chunk of analyzer.continueAnalysis(
	"Can you explain the error in more detail?",
)) {
	process.stdout.write(chunk);
}
```

## Changelog

### 0.0.0 (TBD)

- Initial release
