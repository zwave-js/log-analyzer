#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ZWaveLogAnalyzer } from "./lib/zwave-log-analyzer.js";

const argv = yargs(hideBin(process.argv))
	.usage("Usage: $0 <filename> [options]")
	.command(
		"$0 <filename>",
		"Analyze a Z-Wave JS log file using AI",
		(yargs) =>
			yargs
				.positional("filename", {
					describe: "Input log filename",
					type: "string",
					demandOption: true,
				})
				.option("question", {
					alias: "q",
					type: "string",
					describe: "Specific question to ask about the log file",
					default:
						"Analyze this log file and look for any issues or interesting patterns.",
				}),
		() => {},
	)
	.strict()
	.help()
	.parseSync();

async function main() {
	// Check for API key
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error("Error: GEMINI_API_KEY environment variable is required");
		console.error(
			"Get your API key at: https://aistudio.google.com/app/apikey",
		);
		process.exit(1);
	}

	// Get filename and question from parsed arguments
	const filename = argv.filename as string;
	const question = argv.question as string;

	// Initialize the analyzer
	const analyzer = new ZWaveLogAnalyzer(apiKey);

	try {
		// Stream the response to stdout
		for await (const chunk of analyzer.analyzeLogFile(filename, question)) {
			process.stdout.write(chunk);
		}
	} catch (error) {
		console.error("Error during analysis:", (error as Error).message);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Unexpected error:", error);
	process.exit(1);
});
