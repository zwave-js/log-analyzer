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

## MCP Server

This package includes an [MCP](https://modelcontextprotocol.io/) server that exposes the log query tools over stdio, allowing AI agents to analyze Z-Wave JS logs in a tool-driven fashion without loading the entire log into context.

### Usage

```bash
npx --package=@zwave-js/log-analyzer zwave-log-analyzer-mcp
```

Or configure it in an MCP client:

```json
{
	"mcpServers": {
		"zwave-log-analyzer": {
			"command": "npx",
			"args": [
				"--package=@zwave-js/log-analyzer",
				"zwave-log-analyzer-mcp"
			]
		}
	}
}
```

### Tools

- `loadLogFile` — Load a Z-Wave JS log file for analysis (must be called first)
- `getLogSummary` — Overall statistics: entries, time range, nodes, network activity
- `getNodeSummary` — Traffic and signal quality summary for a specific node
- `getNodeCommunication` — Enumerate communication attempts with a node
- `getEventsAroundTimestamp` — Log entries around a specific timestamp
- `getBackgroundRSSIBefore` — Most recent background RSSI reading before a timestamp
- `searchLogEntries` — Search entries by text/regex with filters and pagination
- `getLogChunk` — Read specific ranges of log entries by index

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

<!--
	Placeholder for next release:
	### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**

- Fixed missing entrypoints and MCP server runtime checks

### 0.1.0 (2026-07-07)

- Exposed the log analyzer functionality as an MCP server

### 0.0.2 (2025-08-14)

- Fixed an issue where the package could not be imported due to a wrong field in `package.json`

### 0.0.1 (2025-08-12)

- Initial release
