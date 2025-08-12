import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { LogTransformPipeline } from "../src/lib/log-processor";
import fs from "node:fs/promises";

const argv = yargs(hideBin(process.argv))
	.usage("Usage: $0 <filename> [--pretty]")
	.command(
		"$0 <filename>",
		"Analyze a Z-Wave log file",
		(yargs) =>
			yargs
				.positional("filename", {
					describe: "Input log filename",
					type: "string",
				})
				.option("pretty", {
					type: "boolean",
					describe: "Pretty-print output",
					default: false,
				}),
		() => {},
	)
	.strict()
	.help()
	.parseSync();

const filenameStr = String(argv.filename);

const log = await fs.readFile(filenameStr, "utf8");
const pipeline = new LogTransformPipeline();
const transformedLog = await pipeline.processLogContent(log);

await fs.rm(filenameStr + ".jsonl", { force: true });

for (const entry of transformedLog) {
	const line = argv.pretty
		? JSON.stringify(entry, null, 2)
		: JSON.stringify(entry);
	await fs.appendFile(filenameStr + ".jsonl", line + "\n");
}
