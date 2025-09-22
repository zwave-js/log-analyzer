import { stripUndefined } from "@zwave-js/core";
import type {
	UnformattedLogInfo,
	LogInfoPayload,
	SemanticLogInfo,
} from "../types.js";
import { SemanticLogKind } from "../types.js";

const TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/;

function tryParseValue(rawValue: string) {
	let value: string | number | boolean = rawValue;
	if (/^\d+$/.test(rawValue)) {
		value = parseInt(rawValue, 10);
	} else if (/^\d+\.\d+$/.test(rawValue)) {
		value = parseFloat(rawValue);
	} else if (/^(true|false)$/.test(rawValue)) {
		value = rawValue === "true";
	}
	return value;
}

/** Transforms chunks of a log into individual, complete log entries */
export class CompleteLogEntries extends TransformStream<string, string> {
	constructor() {
		const lines: string[] = [];
		let receiveBuffer = "";

		function enqueueCompleteEntries(
			controller: TransformStreamDefaultController<string>,
		): void {
			// Find the indizes of all lines that start with a timestamp.
			// These indicate the start of a new log entry.
			const startIndizes = lines
				.map((line, index) => {
					if (TIMESTAMP_REGEX.test(line)) {
						return index;
					}
					return -1;
				})
				.filter((index) => index >= 0);

			// We can only be sure to have complete log entries if there are at
			// least two timestamps found.
			if (startIndizes.length <= 1) return;

			// For each complete log entry, concatenate all lines that belong to it
			// The last entry is always considered incomplete, so we ignore it here
			for (let i = 0; i < startIndizes.length - 1; i++) {
				const startIndex = startIndizes[i];
				const endIndex = startIndizes[i + 1];
				const entryLines = lines.slice(startIndex, endIndex);
				const entry = entryLines.join("\n");
				controller.enqueue(entry);
			}
			// Remove all lines that have been processed
			lines.splice(0, startIndizes.at(-1));
		}

		const transformer: Transformer<string, string> = {
			transform(chunk, controller) {
				receiveBuffer += chunk;

				// Split the buffer into lines, while ignoring the last incomplete line
				const newLines = receiveBuffer.split("\n");
				if (newLines.length > 1) {
					lines.push(...newLines.slice(0, -1));
					receiveBuffer = newLines.at(-1)!;
				}

				enqueueCompleteEntries(controller);
			},
			flush(controller) {
				// Emit the complete entries that are still in the buffer
				enqueueCompleteEntries(controller);

				// Emit the rest of the lines as a single entry
				if (receiveBuffer.length > 0) {
					lines.push(receiveBuffer);
				}
				if (lines.length > 0) {
					controller.enqueue(lines.join("\n"));
				}
			},
		};

		super(transformer);
	}
}

/** Transforms individual formatted log entries back into structured logging information */
export class UnformatLogEntry extends TransformStream<
	string,
	UnformattedLogInfo
> {
	constructor() {
		const transformer: Transformer<string, UnformattedLogInfo> = {
			transform(chunk, controller) {
				const [firstLine, ...otherLines] = chunk.split("\n");
				const timestamp = firstLine.match(TIMESTAMP_REGEX)?.[0];
				if (!timestamp) return;
				let restOfFirstLine = firstLine.slice(timestamp.length).trim();

				// Find the log label, which is the first word after the timestamp
				const labelEndIndex = restOfFirstLine.indexOf(" ");
				if (labelEndIndex === -1) return;
				const label = restOfFirstLine.slice(0, labelEndIndex);
				restOfFirstLine = restOfFirstLine
					.slice(labelEndIndex + 1)
					.trim();

				// After the label, we expect optional direction indicator arrows
				let direction: "inbound" | "outbound" | "none" = "none";
				if (restOfFirstLine.startsWith("« ")) {
					direction = "inbound";
					restOfFirstLine = restOfFirstLine.slice(2).trim();
				} else if (restOfFirstLine.startsWith("» ")) {
					direction = "outbound";
					restOfFirstLine = restOfFirstLine.slice(2).trim();
				}

				// The first line may start with several primary tags, which are surrounded by square brackets
				// and separated by spaces
				const primaryTags: string[] = [];
				const tagRegex = /^\[([^\]]+)\]\s?/;
				let match: RegExpExecArray | null;
				while ((match = tagRegex.exec(restOfFirstLine)) !== null) {
					primaryTags.push(match[1]);
					restOfFirstLine = restOfFirstLine.slice(match[0].length);
				}
				// The first line may end with an optional secondary tag in parentheses
				const secondaryTags =
					restOfFirstLine.match(/\(([^)]+)\)$/)?.[1];
				if (secondaryTags) {
					restOfFirstLine = restOfFirstLine
						.slice(0, -secondaryTags.length - 2)
						.trim();
				}

				// We don't want to treat the last/only tag as a primary tag, though, e.g.:
				// [ACK]
				// [Node 257] [REQ] [BridgeApplicationCommand]
				if (primaryTags.length > 0 && !restOfFirstLine) {
					restOfFirstLine = `[${primaryTags.pop()}]`;
				}

				// The rest of the first line, and the unindented remaining lines are the message
				const indentation = timestamp.length + 1 + label.length + 3; // timestamp + label + direction arrows
				const message = [
					restOfFirstLine,
					...otherLines.map((line) => line.slice(indentation)),
				]
					.filter((line) => line.length > 0)
					.join("\n");

				const info: UnformattedLogInfo = {
					timestamp,
					label,
					direction,
					message,
					...(primaryTags?.length ? { primaryTags } : {}),
					...(secondaryTags ? { secondaryTags } : {}),
				};

				controller.enqueue(info);
			},
		};

		super(transformer);
	}
}

/** Parses (nested) structures from log entries */
export class ParseNestedStructures extends TransformStream<
	UnformattedLogInfo,
	UnformattedLogInfo
> {
	constructor() {
		function parseNestedStructure(
			lines: string[],
		): LogInfoPayload | undefined {
			// Nested structures have a recursive definition.
			// The initial line is always in square brackets

			if (
				lines.length < 1 ||
				!lines[0].startsWith("[") ||
				!lines[0].endsWith("]")
			) {
				// Not a nested structure
				return;
			}

			const message = lines.shift()!;
			// Attributes are always in their own line, starting with two spaces
			// or "│ ". In some cases, they are too long to fit the rest of the line
			// and mess up the indentation, so we always search for the next indentation
			// indicator.
			const attributesRaw: string[] = [];
			let nested: LogInfoPayload | undefined;

			while (lines.length > 0) {
				const line = lines.shift()!;
				if (line.startsWith("  ") || line.startsWith("│ ")) {
					// This is an attribute line
					attributesRaw.push(line.slice(2));
				} else if (line.startsWith("└─")) {
					// This marks the beginning of a new nested structure
					const unindented = [line, ...lines].map((l) => l.slice(2));
					nested = parseNestedStructure(unindented);
					break;
				} else if (attributesRaw.length > 0) {
					// This is a continuation of the last attribute line
					attributesRaw[attributesRaw.length - 1] += line;
				}
			}

			const attributes = Object.fromEntries(
				attributesRaw.map((attr) => {
					const colonIndex = attr.indexOf(":");
					if (colonIndex === -1) {
						// No colon found, treat the whole line as a key
						return [attr.trim(), ""];
					}

					const key = attr.slice(0, colonIndex).trim();
					const rawValue = attr.slice(colonIndex + 1).trim();

					// Parse the value into a number, or boolean where applicable
					const value: string | number | boolean =
						tryParseValue(rawValue);
					return [key, value];
				}),
			);

			const ret: LogInfoPayload = { message };
			if (attributesRaw.length > 0) {
				ret.attributes = attributes;
			}
			if (nested) {
				ret.nested = nested;
			}

			return ret;
		}

		const transformer: Transformer<UnformattedLogInfo, UnformattedLogInfo> =
			{
				transform(chunk, controller) {
					// Nested structures only appear for Serial API commands,
					// which are indicated by a multiline message
					// with the first line in square brackets
					if (
						typeof chunk.message !== "string" ||
						!chunk.message.includes("\n")
					) {
						controller.enqueue(chunk);
						return;
					}

					const lines = chunk.message.split("\n");
					if (
						lines.length < 2 ||
						!lines[0].startsWith("[") ||
						!lines[0].endsWith("]")
					) {
						controller.enqueue(chunk);
						return;
					}

					const nested = parseNestedStructure(lines);
					if (nested) {
						chunk.message = nested;
					}

					controller.enqueue(chunk);
				},
			};

		super(transformer);
	}
}

/** Filters logs that are not interesting for analysis */
export class FilterLogEntries extends TransformStream<
	UnformattedLogInfo,
	UnformattedLogInfo
> {
	constructor() {
		const transformer: Transformer<UnformattedLogInfo, UnformattedLogInfo> =
			{
				transform(chunk, controller) {
					if (
						chunk.label === "DRIVER" &&
						chunk.direction === "none" &&
						typeof chunk.message === "string" &&
						(chunk.message.endsWith("queues busy") ||
							chunk.message.endsWith("queues idle"))
					) {
						return;
					}

					if (chunk.label === "SERIAL") {
						// The raw serial data is not interesting for automatic analysis
						return;
					}

					// Ignore SILLY level logs
					if (
						chunk.label === "CNTRLR" &&
						typeof chunk.message === "object" &&
						chunk.message.message.includes("translateValueEvent:")
					) {
						return;
					}
					if (
						chunk.label === "CNTRLR" &&
						chunk.primaryTags?.includes("setValue")
					) {
						return;
					}

					// Keep all other entries
					controller.enqueue(chunk);
				},
			};

		super(transformer);
	}
}

/** Assigns semantic meaning to log entries */
export class ClassifyLogEntry extends TransformStream<
	UnformattedLogInfo,
	SemanticLogInfo
> {
	constructor() {
		function extractAttribute<T extends string | number | boolean>(
			info: LogInfoPayload,
			key: string,
		): T | undefined {
			if (info.attributes && key in info.attributes) {
				let ret = info.attributes[key] as T | undefined;
				if (
					typeof ret !== "string" &&
					typeof ret !== "number" &&
					typeof ret !== "boolean"
				) {
					ret = undefined;
				}
				delete info.attributes[key];
				if (Object.keys(info.attributes).length === 0) {
					delete info.attributes;
				}
				return ret;
			}
			return undefined;
		}

		function stripSquareBrackets(info: LogInfoPayload): void {
			if (info.message.startsWith("[") && info.message.endsWith("]")) {
				info.message = info.message.slice(1, -1);
			}
			if (info.nested) stripSquareBrackets(info.nested);
		}

		function hasNodeIdTag(chunk: UnformattedLogInfo): boolean {
			return !!chunk.primaryTags?.some((tag) => tag.startsWith("Node "));
		}

		function extractNodeIdTag(
			chunk: UnformattedLogInfo,
		): number | undefined {
			const index = chunk.primaryTags?.findIndex((t) =>
				t.startsWith("Node "),
			);
			if (index === undefined || index < 0) return undefined;

			const tag = chunk.primaryTags!.splice(index, 1)[0];
			return parseInt(tag.slice(5), 10);
		}

		function parseValueAddedMessage(message: string):
			| {
					endpointIndex?: number;
					property: string;
					propertyKey?: string;
					value: string | number | boolean;
			  }
			| undefined {
			const pattern =
				/^(?<property>[^[:]+)(?:\[(?<key>[^[]+)\])?: (?<value>.+?)(?:\s*\[Endpoint (?<endpoint>\d+)\])?$/;
			const match = message.match(pattern);
			if (!match) return undefined;

			const { property, key, value, endpoint } = match.groups!;

			return stripUndefined({
				endpointIndex: endpoint ? parseInt(endpoint, 10) : undefined,
				property: property,
				propertyKey: key,
				value: tryParseValue(value),
			}) as {
				endpointIndex?: number;
				property: string;
				propertyKey?: string;
				value: string | number | boolean;
			};
		}

		function parseValueUpdatedMessage(message: string):
			| {
					endpointIndex?: number;
					property: string;
					propertyKey?: string;
					prevValue: string | number | boolean;
					value: string | number | boolean;
			  }
			| undefined {
			const pattern =
				/^(?<property>[^[:]+)(?:\[(?<key>[^[]+)\])?: (?<prev>.+?) => (?<value>.+?)(?:\s*\[Endpoint (?<endpoint>\d+)\])?$/;
			const match = message.match(pattern);
			if (!match) return undefined;

			const { property, key, prev, value, endpoint } = match.groups!;

			return stripUndefined({
				endpointIndex: endpoint ? parseInt(endpoint, 10) : undefined,
				property: property,
				propertyKey: key,
				prevValue: tryParseValue(prev),
				value: tryParseValue(value),
			}) as {
				endpointIndex?: number;
				property: string;
				propertyKey?: string;
				prevValue: string | number | boolean;
				value: string | number | boolean;
			};
		}

		function parseValueRemovedMessage(message: string):
			| {
					endpointIndex?: number;
					property: string;
					propertyKey?: string;
					prevValue: string | number | boolean;
			  }
			| undefined {
			const pattern =
				/^(?<property>[^[:]+)(?:\[(?<key>[^[]+)\])? \(was (?<prev>[^)]+?)\)(?:\s*\[Endpoint (?<endpoint>\d+)\])?$/;
			const match = message.match(pattern);
			if (!match) return undefined;

			const { property, key, prev, endpoint } = match.groups!;

			return stripUndefined({
				endpointIndex: endpoint ? parseInt(endpoint, 10) : undefined,
				property: property,
				propertyKey: key,
				prevValue: tryParseValue(prev),
			}) as any;
		}

		function parseMetadataUpdatedMessage(message: string):
			| {
					endpointIndex?: number;
					property: string;
					propertyKey?: string;
			  }
			| undefined {
			const pattern =
				/^(?<property>[^[:]+)(?:\[(?<key>[^[]+)\])?: metadata updated(?:\s*\[Endpoint (?<endpoint>\d+)\])?$/;
			const match = message.match(pattern);
			if (!match) return undefined;

			const { property, key, endpoint } = match.groups!;

			return stripUndefined({
				endpointIndex: endpoint ? parseInt(endpoint, 10) : undefined,
				property: property,
				propertyKey: key,
			}) as any;
		}

		const transformer: Transformer<UnformattedLogInfo, SemanticLogInfo> = {
			transform(chunk, controller) {
				// Find incoming commands
				if (
					chunk.label === "DRIVER" &&
					chunk.direction === "inbound" &&
					chunk.primaryTags?.includes("REQ") &&
					hasNodeIdTag(chunk) &&
					typeof chunk.message !== "string" &&
					chunk.message.message.endsWith("ApplicationCommand]") &&
					chunk.message.nested
				) {
					const nodeId = extractNodeIdTag(chunk)!;
					const rssi = extractAttribute<string>(
						chunk.message,
						"RSSI",
					);

					let invalid = false;
					if (chunk.message.nested?.message.endsWith(" [INVALID]")) {
						invalid = true;
						chunk.message.nested.message =
							chunk.message.nested.message.slice(
								0,
								-" [INVALID]".length,
							);
					}

					stripSquareBrackets(chunk.message.nested);

					const classified: SemanticLogInfo = {
						kind: SemanticLogKind.IncomingCommand,
						timestamp: chunk.timestamp,
						nodeId,
						...(rssi ? { rssi } : {}),
						payload: chunk.message.nested,
					};

					if (invalid) {
						classified.invalid = true;
					}

					controller.enqueue(classified);
					return;
				}

				if (
					chunk.label === "DRIVER" &&
					chunk.direction === "outbound" &&
					chunk.primaryTags?.includes("REQ") &&
					hasNodeIdTag(chunk) &&
					typeof chunk.message !== "string" &&
					chunk.message.message.startsWith("[SendData") &&
					chunk.message.nested
				) {
					const nodeId = extractNodeIdTag(chunk)!;
					const transmitOptions = extractAttribute<string>(
						chunk.message,
						"transmit options",
					);
					const callbackId = extractAttribute<number>(
						chunk.message,
						"callback id",
					);
					extractAttribute<number>(chunk.message, "source node id");

					if (callbackId == undefined) {
						console.warn(
							"Found SendData request without callback ID at ",
							chunk.timestamp,
						);
					}

					stripSquareBrackets(chunk.message);

					controller.enqueue({
						kind: SemanticLogKind.SendDataRequest,
						timestamp: chunk.timestamp,
						nodeId,
						transmitOptions: transmitOptions!,
						callbackId: callbackId!,
						payload: chunk.message.nested,
					});
					return;
				}

				if (
					chunk.label === "DRIVER" &&
					chunk.direction === "inbound" &&
					chunk.primaryTags?.includes("RES") &&
					typeof chunk.message !== "string" &&
					chunk.message.message.startsWith("[SendData")
				) {
					const success = !!extractAttribute<boolean>(
						chunk.message,
						"was sent",
					);
					stripSquareBrackets(chunk.message);

					controller.enqueue({
						kind: SemanticLogKind.SendDataResponse,
						timestamp: chunk.timestamp,
						success,
					});
					return;
				}

				if (
					chunk.label === "DRIVER" &&
					chunk.direction === "inbound" &&
					chunk.primaryTags?.includes("REQ") &&
					typeof chunk.message !== "string" &&
					chunk.message.message.startsWith("[SendData")
				) {
					const callbackId = extractAttribute<number>(
						chunk.message,
						"callback id",
					);
					if (callbackId == undefined) {
						console.warn(
							"Found SendData callback without callback ID at ",
							chunk.timestamp,
						);
					}

					stripSquareBrackets(chunk.message);

					controller.enqueue({
						kind: SemanticLogKind.SendDataCallback,
						timestamp: chunk.timestamp,
						callbackId: callbackId!,
						attributes: chunk.message.attributes ?? {},
					});
					return;
				}

				// Classify unspecified requests/responses/callbacks
				if (
					chunk.label === "DRIVER" &&
					chunk.direction !== "none" &&
					chunk.primaryTags?.length
				) {
					let classified: SemanticLogInfo | undefined;
					if (
						chunk.direction === "outbound" &&
						chunk.primaryTags.includes("REQ")
					) {
						classified = {
							kind: SemanticLogKind.Request,
							...chunk,
						} as any;
					} else if (
						chunk.direction === "inbound" &&
						chunk.primaryTags.includes("RES")
					) {
						classified = {
							kind: SemanticLogKind.Response,
							...chunk,
						} as any;
					} else if (
						chunk.direction === "inbound" &&
						chunk.primaryTags.includes("REQ")
					) {
						classified = {
							kind: SemanticLogKind.Callback,
							...chunk,
						} as any;
					}

					if (classified) {
						const stopWorryingTypeScript = classified as any;
						delete stopWorryingTypeScript.label;
						stopWorryingTypeScript.primaryTags =
							stopWorryingTypeScript.primaryTags?.filter(
								(tag: string) => tag !== "REQ" && tag !== "RES",
							);
						if (stopWorryingTypeScript.primaryTags.length === 0) {
							delete stopWorryingTypeScript.primaryTags;
						}

						if (
							typeof stopWorryingTypeScript.message === "string"
						) {
							// stripSquareBrackets expects an object
						} else {
							stripSquareBrackets(stopWorryingTypeScript.message);
						}

						controller.enqueue(classified);
						return;
					}
				}

				// Find value events
				if (
					chunk.label === "CNTRLR" &&
					chunk.direction === "none" &&
					hasNodeIdTag(chunk) &&
					typeof chunk.message === "string"
				) {
					if (chunk.primaryTags!.includes("+")) {
						const commandClass = chunk.primaryTags!.findLast(
							(t) => t !== "+",
						);
						const parsed = parseValueAddedMessage(chunk.message);
						if (commandClass && parsed) {
							const nodeId = extractNodeIdTag(chunk)!;
							controller.enqueue({
								kind: SemanticLogKind.ValueAdded,
								timestamp: chunk.timestamp,
								nodeId,
								commandClass,
								...parsed,
							});
							return;
						}
					} else if (chunk.primaryTags!.includes("~")) {
						const commandClass = chunk.primaryTags!.findLast(
							(t) => t !== "~",
						);
						const parsed = parseValueUpdatedMessage(chunk.message);
						if (commandClass && parsed) {
							const nodeId = extractNodeIdTag(chunk)!;
							controller.enqueue({
								kind: SemanticLogKind.ValueUpdated,
								timestamp: chunk.timestamp,
								nodeId,
								commandClass,
								...parsed,
							});
							return;
						}
					} else if (chunk.primaryTags!.includes("-")) {
						const commandClass = chunk.primaryTags!.findLast(
							(t) => t !== "-",
						);
						const parsed = parseValueRemovedMessage(chunk.message);
						if (commandClass && parsed) {
							const nodeId = extractNodeIdTag(chunk)!;
							controller.enqueue({
								kind: SemanticLogKind.ValueRemoved,
								timestamp: chunk.timestamp,
								nodeId,
								commandClass,
								...parsed,
							});
							return;
						}
					} else if (chunk.primaryTags?.length === 2) {
						const parsed = parseMetadataUpdatedMessage(
							chunk.message,
						);
						if (parsed) {
							const commandClass = chunk.primaryTags.at(-1)!;
							const nodeId = extractNodeIdTag(chunk)!;
							controller.enqueue({
								kind: SemanticLogKind.MetadataUpdated,
								timestamp: chunk.timestamp,
								nodeId,
								commandClass,
								...parsed,
							});
							return;
						}
					}
				}

				// Treat all other entries as "other"
				controller.enqueue({
					kind: SemanticLogKind.Other,
					...chunk,
				});
			},
		};

		super(transformer);
	}
}

/** Merges GetBackgroundRSSI requests and responses into single entries */
export class DetectBackgroundRSSICalls extends TransformStream<
	SemanticLogInfo,
	SemanticLogInfo
> {
	constructor() {
		let pendingRequest: SemanticLogInfo | undefined;
		const bufferedEntries: SemanticLogInfo[] = [];

		function parseTimestamp(timestamp: string): number {
			return new Date(timestamp).getTime();
		}

		function flushBufferedEntries(
			controller: TransformStreamDefaultController<SemanticLogInfo>,
		) {
			for (const entry of bufferedEntries) {
				controller.enqueue(entry);
			}
			bufferedEntries.length = 0;
		}

		const transformer: Transformer<SemanticLogInfo, SemanticLogInfo> = {
			transform(chunk, controller) {
				// Check if this is a GetBackgroundRSSI request
				if (
					chunk.kind === "REQUEST" &&
					chunk.direction === "outbound" &&
					chunk.message === "[GetBackgroundRSSI]"
				) {
					// If we already have a pending request, flush it and start fresh
					this.flush!(controller);

					// Store the new request as pending
					pendingRequest = chunk;
					return;
				}

				if (!pendingRequest) {
					// No pending request, pass through immediately
					controller.enqueue(chunk);
					return;
				}

				const requestTime = parseTimestamp(pendingRequest.timestamp);
				const currentTime = parseTimestamp(chunk.timestamp);
				const timeDiff = currentTime - requestTime;

				// If more than 200ms have passed, flush everything
				if (timeDiff > 200) {
					this.flush!(controller);
					controller.enqueue(chunk);
					return;
				}

				// Check if this is the matching GetBackgroundRSSI response
				if (
					chunk.kind === "RESPONSE" &&
					chunk.direction === "inbound" &&
					typeof chunk.message === "object" &&
					chunk.message.message === "GetBackgroundRSSI" &&
					chunk.message.attributes
				) {
					// Flush all buffered entries first
					flushBufferedEntries(controller);

					// Create and emit the merged entry (do not emit the original request)
					const attributes = chunk.message.attributes;
					const mergedEntry: SemanticLogInfo = {
						kind: "BACKGROUND_RSSI",
						timestamp: pendingRequest.timestamp,
						"channel 0": attributes["channel 0"] as string,
						"channel 1": attributes["channel 1"] as string,
						...(attributes["channel 2"]
							? { "channel 2": attributes["channel 2"] as string }
							: {}),
						...(attributes["channel 3"]
							? { "channel 3": attributes["channel 3"] as string }
							: {}),
					};

					controller.enqueue(mergedEntry);
					pendingRequest = undefined;
					return;
				}

				// No the response we were looking for - buffer this entry while we wait for a response
				bufferedEntries.push(chunk);
				return;
			},

			flush(controller) {
				// Emit any remaining pending request and buffered entries
				if (pendingRequest) {
					controller.enqueue(pendingRequest);
				}
				pendingRequest = undefined;
				flushBufferedEntries(controller);
			},
		};

		super(transformer);
	}
}

/** Aggregates consecutive BACKGROUND_RSSI entries into statistical summaries */
export class AggregateBackgroundRSSI extends TransformStream<
	SemanticLogInfo,
	SemanticLogInfo
> {
	constructor() {
		const bufferedRSSIEntries: SemanticLogInfo[] = [];

		function parseRSSIValue(rssiString: string): number {
			// Parse "-107 dBm" -> -107
			return parseInt(rssiString, 10);
		}

		function calculateMedian(values: number[]): number {
			const sorted = [...values].sort((a, b) => a - b);
			const mid = Math.floor(sorted.length / 2);
			if (sorted.length % 2 === 0) {
				return (sorted[mid - 1] + sorted[mid]) / 2;
			}
			return sorted[mid];
		}

		function calculateStdDev(values: number[]): number {
			const mean =
				values.reduce((sum, val) => sum + val, 0) / values.length;
			const variance =
				values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
				values.length;
			return Math.sqrt(variance);
		}

		function findMinMaxWithTimestamp(
			values: number[],
			timestamps: string[],
		): {
			min: { value: number; timestamp: string };
			max: { value: number; timestamp: string };
		} {
			let minValue = values[0];
			let maxValue = values[0];
			let minTimestamp = timestamps[0];
			let maxTimestamp = timestamps[0];

			for (let i = 1; i < values.length; i++) {
				if (values[i] < minValue) {
					minValue = values[i];
					minTimestamp = timestamps[i];
				}
				if (values[i] > maxValue) {
					maxValue = values[i];
					maxTimestamp = timestamps[i];
				}
			}

			return {
				min: { value: minValue, timestamp: minTimestamp },
				max: { value: maxValue, timestamp: maxTimestamp },
			};
		}

		function aggregateRSSIEntries(
			entries: SemanticLogInfo[],
		): SemanticLogInfo {
			const channels: Record<
				string,
				{ values: number[]; timestamps: string[] }
			> = {};

			// Collect all channel data
			for (const entry of entries) {
				if (entry.kind !== "BACKGROUND_RSSI") continue;

				for (const [channelKey, rssiString] of Object.entries(entry)) {
					if (channelKey === "kind" || channelKey === "timestamp")
						continue;
					if (typeof rssiString !== "string") continue;

					channels[channelKey] ??= { values: [], timestamps: [] };

					channels[channelKey].values.push(
						parseRSSIValue(rssiString),
					);
					channels[channelKey].timestamps.push(entry.timestamp);
				}
			}

			// Calculate statistics for each channel
			const channelStats: Record<string, any> = {};
			for (const [channelKey, data] of Object.entries(channels)) {
				const { min, max } = findMinMaxWithTimestamp(
					data.values,
					data.timestamps,
				);
				const median = calculateMedian(data.values);
				const stddev =
					Math.round(calculateStdDev(data.values) * 100) / 100; // Round to 2 decimal places

				channelStats[channelKey] = {
					min,
					max,
					median,
					stddev,
				};
			}

			const summary: SemanticLogInfo = {
				kind: "BACKGROUND_RSSI_SUMMARY",
				timestamp: entries[0].timestamp,
				samples: entries.length,
				time_range: {
					start: entries[0].timestamp,
					end: entries.at(-1)!.timestamp,
				},
				...channelStats,
			} as any;

			return summary;
		}

		function flushBufferedEntries(
			controller: TransformStreamDefaultController<SemanticLogInfo>,
		) {
			if (bufferedRSSIEntries.length === 0) return;

			if (bufferedRSSIEntries.length <= 2) {
				// Not enough entries to aggregate, emit raw entries
				for (const entry of bufferedRSSIEntries) {
					controller.enqueue(entry);
				}
			} else {
				// Aggregate the entries
				const summary = aggregateRSSIEntries(bufferedRSSIEntries);
				controller.enqueue(summary);
			}

			bufferedRSSIEntries.length = 0;
		}

		const transformer: Transformer<SemanticLogInfo, SemanticLogInfo> = {
			transform(chunk, controller) {
				if (chunk.kind === "BACKGROUND_RSSI") {
					// Buffer this RSSI entry
					bufferedRSSIEntries.push(chunk);
					return;
				}

				// Different entry type found, flush any buffered RSSI entries
				flushBufferedEntries(controller);

				// Pass through the current entry
				controller.enqueue(chunk);
			},

			flush(controller) {
				// Flush any remaining buffered RSSI entries
				flushBufferedEntries(controller);
			},
		};

		super(transformer);
	}
}

/** Main pipeline class that processes log content through all transform stages */
export class LogTransformPipeline {
	async processLogContent(logContent: string): Promise<SemanticLogInfo[]> {
		const entries: SemanticLogInfo[] = [];

		// Create the transform pipeline
		const completeLogEntries = new CompleteLogEntries();
		const unformatLogEntry = new UnformatLogEntry();
		const parseNestedStructures = new ParseNestedStructures();
		const filterLogEntries = new FilterLogEntries();
		const classifyLogEntry = new ClassifyLogEntry();
		const detectBackgroundRSSICalls = new DetectBackgroundRSSICalls();
		const aggregateBackgroundRSSI = new AggregateBackgroundRSSI();

		// Create a writable stream to collect results
		const writableStream = new WritableStream<SemanticLogInfo>({
			write(chunk) {
				entries.push(chunk);
			},
		});

		// Connect the pipeline
		const readable = new ReadableStream({
			start(controller) {
				controller.enqueue(logContent);
				controller.close();
			},
		});

		await readable
			.pipeThrough(completeLogEntries)
			.pipeThrough(unformatLogEntry)
			.pipeThrough(parseNestedStructures)
			.pipeThrough(filterLogEntries)
			.pipeThrough(classifyLogEntry)
			.pipeThrough(detectBackgroundRSSICalls)
			.pipeThrough(aggregateBackgroundRSSI)
			.pipeTo(writableStream);

		return entries;
	}
}
