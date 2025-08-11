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
    () => {}
  )
  .strict()
  .help()
  .parseSync();

const filenameStr = String(argv.filename);

// const rs = createReadStream(filenameStr, {
// 	encoding: "utf8",
// });
// const source: UnderlyingSource<string> = {
// 	start(controller) {
// 		rs.on("data", (chunk: any) => {
// 			controller.enqueue(chunk);
// 		});
// 		rs.on("end", () => {
// 			controller.close();
// 		});
// 		rs.on("error", (err) => {
// 			controller.error(err);
// 		});
// 	},
// 	cancel() {
// 		rs.removeAllListeners();
// 		rs.destroy();
// 	},
// };
// const readable = new ReadableStream<string>(source);

// const parser = new CompleteLogEntries();
// const unfmt = new UnformatLogEntry();
// const filter = new FilterLogEntries();
// const parseNested = new ParseNestedStructures();
// const classify = new ClassifyLogEntry();

// const iter = readable
// 	.pipeThrough(parser)
// 	.pipeThrough(unfmt)
// 	.pipeThrough(parseNested)
// 	.pipeThrough(filter)
// 	.pipeThrough(classify)
// 	// TODO: Group related entries somehow
// 	.values();

// for await (const chunk of iter) {
// 	if (argv.pretty) {
// 		console.dir(chunk, { depth: Infinity });
// 	} else {
// 		console.log(JSON.stringify(chunk));
// 	}
// }

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
