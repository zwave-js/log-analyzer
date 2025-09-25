import type { SemanticLogInfo, SemanticLogKind } from "./types.js";

// Tool argument interfaces

export interface GetNodeSummaryArgs {
	nodeId: number;
	timeRange?: {
		start: string;
		end: string;
	};
}

export interface GetNodeCommunicationArgs {
	nodeId: number;
	timeRange?: {
		start: string;
		end: string;
	};
	direction?: "incoming" | "outgoing" | "both";
	limit?: number;
	offset?: number;
}

export interface GetEventsAroundTimestampArgs {
	timestamp: string;
	beforeSeconds?: number;
	afterSeconds?: number;
	entryKinds?: SemanticLogKind[];
	limit?: number;
	offset?: number;
}

export interface GetBackgroundRSSIBeforeArgs {
	timestamp: string;
	maxAge?: number;
	channel?: number;
}

export interface AttributeFilter {
	path: string; // dot-separated path to the attribute (e.g., "nodeId", "payload.attributes.transmit status", "rssi")
	operator: "gt" | "gte" | "eq" | "lt" | "lte" | "ne" | "match";
	value: string | number | boolean;
}

export interface SearchLogEntriesArgs {
	query?: string;
	entryKinds?: SemanticLogKind[];
	timeRange?: {
		start: string;
		end: string;
	};
	attributeFilters?: AttributeFilter[];
	limit?: number;
	offset?: number;
}

export interface GetLogChunkArgs {
	startIndex: number;
	count: number;
}
// Tool result interfaces

export interface LogSummary {
	totalEntries: number;
	timeRange: {
		start: string;
		end: string;
	};
	nodeIds: number[];
	networkActivity: {
		total: {
			incoming: number;
			outgoing: number;
			total: number;
		};
		byNode: Record<
			number,
			{
				incoming: number;
				outgoing: number;
				total: number;
			}
		>;
	};
	unsolicitedReportIntervals: {
		min: number; // seconds
		max: number;
		mean: number;
		median: number;
		stddev: number;
	} | null;
}

export interface NodeSummary {
	nodeId: number;
	timeRange: {
		start: string;
		end: string;
	};
	rssiStatistics?: {
		min: number;
		max: number;
		mean: number;
		median: number;
		stddev: number;
	};
	commandCounts: {
		incoming: number;
		outgoing: number;
		total: number;
	};
	unsolicitedReportIntervals?: {
		min: number; // seconds
		max: number;
		mean: number;
		median: number;
		stddev: number;
	};
	commandClasses: string[];
}

export interface NodeCommunication {
	nodeId: number;
	events: Array<{
		timestamp: string;
		direction: "incoming" | "outgoing";
		// For incoming events (INCOMING_COMMAND)
		rssi?: string; // e.g., "-108 dBm"
		commandClass?: string; // extracted from payload.message or payload.nested.message

		// For outgoing events (SEND_DATA_REQUEST + SEND_DATA_CALLBACK)
		callbackId?: number;
		transmitOptions?: string[]; // e.g., ["ACK", "AutoRoute"]
		transmitStatus?: string; // e.g., "OK, took 10 ms"
		routingAttempts?: number;
		ackRSSI?: string; // e.g., "-105 dBm"
		txPower?: string; // e.g., "14 dBm"
	}>;
	totalCount: number;
	hasMore: boolean;
}

export interface EventsAroundTimestamp {
	targetTimestamp: string;
	timeWindow: {
		start: string;
		end: string;
	};
	events: SemanticLogInfo[];
	totalCount: number;
	hasMore: boolean;
}

export interface BackgroundRSSIReading {
	timestamp: string;
	age: number; // seconds before the target timestamp
	type: "single" | "summary";
	channels: Record<
		string,
		{
			value?: number; // for single measurements
			min?: number; // for summaries
			max?: number;
			mean?: number;
			median?: number;
			stddev?: number;
		}
	>;
}

export interface SearchResults {
	query: string;
	matches: Array<SemanticLogInfo>;
	totalMatches: number;
	hasMore: boolean;
	error?: string;
}

export interface LogChunk {
	entries: SemanticLogInfo[];
	startIndex: number;
	endIndex: number;
	totalEntries: number;
	hasMore: boolean;
}
// Index interfaces

export interface LogIndexes {
	byTimestamp: Map<string, number>; // timestamp -> entry index
	byNodeId: Map<number, number[]>; // nodeId -> entry indexes
	byEntryType: Map<SemanticLogKind, number[]>; // type -> entry indexes
	timeRangeIndex: TimeRangeIndex; // for efficient time-based queries
	textSearchIndex: TextSearchIndex; // for keyword/regex searches
	backgroundRSSIIndex: BackgroundRSSIIndex; // for RSSI lookups
}

// Module-level utility functions
function parseTimestamp(timestamp: string): number {
	return new Date(timestamp).getTime();
}

// Binary search utility functions
function findFirstIndexAtOrAfter<T>(
	array: T[],
	targetTime: number,
	getTime: (item: T) => number
): number {
	let left = 0;
	let right = array.length - 1;
	let result = array.length;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const entryTime = getTime(array[mid]);

		if (entryTime >= targetTime) {
			result = mid;
			right = mid - 1;
		} else {
			left = mid + 1;
		}
	}

	return result;
}

function findLastIndexAtOrBefore<T>(
	array: T[],
	targetTime: number,
	getTime: (item: T) => number
): number {
	let left = 0;
	let right = array.length - 1;
	let result = -1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const entryTime = getTime(array[mid]);

		if (entryTime <= targetTime) {
			result = mid;
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	return result;
}

function findMostRecentIndexBefore<T>(
	array: T[],
	targetTime: number,
	minTime: number,
	getTime: (item: T) => number
): number | null {
	let left = 0;
	let right = array.length - 1;
	let result: number | null = null;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const entryTime = getTime(array[mid]);

		if (entryTime < targetTime && entryTime >= minTime) {
			result = mid;
			left = mid + 1; // Look for a more recent entry
		} else if (entryTime >= targetTime) {
			right = mid - 1;
		} else {
			left = mid + 1;
		}
	}

	return result;
}

class TimeRangeIndex {
	private buckets: Map<string, number[]> = new Map();
	private entries: SemanticLogInfo[];

	constructor(entries: SemanticLogInfo[]) {
		this.entries = entries;
		this.buildIndex();
	}

	private buildIndex(): void {
		for (let index = 0; index < this.entries.length; index++) {
			const entry = this.entries[index];
			const timestamp = new Date(entry.timestamp);
			// Create time buckets by hour for efficient range queries
			const hourBucket = timestamp.toISOString().slice(0, 13); // YYYY-MM-DDTHH

			if (!this.buckets.has(hourBucket)) {
				this.buckets.set(hourBucket, []);
			}
			this.buckets.get(hourBucket)!.push(index);
		}
	}

	findEntriesInRange(start: string, end: string): number[] {
		const startTime = parseTimestamp(start);
		const endTime = parseTimestamp(end);
		const indices: number[] = [];

		// Since entries are already sorted by timestamp, use binary search for efficiency
		const startIndex = findFirstIndexAtOrAfter(
			this.entries,
			startTime,
			(entry) => parseTimestamp(entry.timestamp)
		);
		const endIndex = findLastIndexAtOrBefore(
			this.entries,
			endTime,
			(entry) => parseTimestamp(entry.timestamp)
		);

		for (let i = startIndex; i <= endIndex; i++) {
			indices.push(i);
		}

		return indices;
	}

	findEntriesAroundTimestamp(
		timestamp: string,
		windowSeconds: number,
	): number[] {
		const targetTime = parseTimestamp(timestamp);
		const startTime = targetTime - windowSeconds * 1000;
		const endTime = targetTime + windowSeconds * 1000;

		const indices: number[] = [];

		for (let i = 0; i < this.entries.length; i++) {
			const entryTime = parseTimestamp(this.entries[i].timestamp);
			if (entryTime >= startTime && entryTime <= endTime) {
				indices.push(i);
			}
		}

		return indices;
	}
}

class TextSearchIndex {
	private contentMap: Map<number, string> = new Map();

	constructor(entries: SemanticLogInfo[]) {
		this.buildIndex(entries);
	}

	private buildIndex(entries: SemanticLogInfo[]): void {
		for (let index = 0; index < entries.length; index++) {
			const entry = entries[index];
			const searchableText = this.extractSearchableText(entry);
			this.contentMap.set(index, searchableText.toLowerCase());
		}
	}

	private extractSearchableText(entry: SemanticLogInfo): string {
		const parts: string[] = [];
		this.extractAllStringFields(entry, parts);
		return parts.join(" ");
	}

	private extractAllStringFields(
		obj: any,
		parts: string[],
		depth: number = 0,
	): void {
		// Prevent infinite recursion
		if (depth > 50 || obj === null || obj === undefined) {
			return;
		}

		if (typeof obj === "string") {
			parts.push(obj);
		} else if (typeof obj === "number" || typeof obj === "boolean") {
			parts.push(String(obj));
		} else if (Array.isArray(obj)) {
			for (const item of obj) {
				this.extractAllStringFields(item, parts, depth + 1);
			}
		} else if (typeof obj === "object") {
			for (const value of Object.values(obj)) {
				this.extractAllStringFields(value, parts, depth + 1);
			}
		}
	}

	search(query: string): number[] {
		const indices: number[] = [];

		// Parse regex delimited syntax /pattern/flags
		let isRegex = false;
		let searchPattern = query;
		let regexFlags = "i"; // Default to case-insensitive

		// Check for /pattern/flags syntax
		const regexMatch = query.match(/^\/(.+?)\/([gimuy]*)$/);
		if (regexMatch) {
			isRegex = true;
			searchPattern = regexMatch[1];
			regexFlags = regexMatch[2] || "i"; // Use provided flags or default to case-insensitive
		} else {
			// Auto-detect regex patterns
			isRegex = this.isLikelyRegex(query);
			searchPattern = query;
		}

		if (isRegex) {
			try {
				const regex = new RegExp(searchPattern, regexFlags);
				for (const [index, content] of this.contentMap.entries()) {
					if (regex.test(content)) {
						indices.push(index);
					}
				}
			} catch {
				// Invalid regex, fall back to plain text search
				const fallbackTerm = regexMatch
					? searchPattern.toLowerCase()
					: query.toLowerCase();
				for (const [index, content] of this.contentMap.entries()) {
					if (content.includes(fallbackTerm)) {
						indices.push(index);
					}
				}
			}
		} else {
			const plainTerm = query.toLowerCase();
			for (const [index, content] of this.contentMap.entries()) {
				if (content.includes(plainTerm)) {
					indices.push(index);
				}
			}
		}

		return indices;
	}

	/**
	 * Auto-detect if a query string looks like a regex pattern
	 */
	private isLikelyRegex(query: string): boolean {
		// Common regex patterns that suggest the user intends regex
		const regexIndicators = [
			/\|/, // Alternation (pipe)
			/\[[^\]]+\]/, // Character classes
			/\([^)]*\)/, // Groups
			/\*|\+|\?/, // Quantifiers
			/\^.*\$/, // Start/end anchors
			/\\[dwsWDS]/, // Common escape sequences
			/\.\*/, // .* pattern
			/\.\+/, // .+ pattern
		];

		return regexIndicators.some((pattern) => pattern.test(query));
	}
}

class BackgroundRSSIIndex {
	private rssiEntries: Array<{ timestamp: string; index: number }> = [];

	constructor(entries: SemanticLogInfo[]) {
		this.buildIndex(entries);
	}

	private buildIndex(entries: SemanticLogInfo[]): void {
		for (let index = 0; index < entries.length; index++) {
			const entry = entries[index];
			if (
				entry.kind === "BACKGROUND_RSSI" ||
				entry.kind === "BACKGROUND_RSSI_SUMMARY"
			) {
				this.rssiEntries.push({
					timestamp: entry.timestamp,
					index,
				});
			}
		}

		// Sort by timestamp for efficient lookups
		this.rssiEntries.sort(
			(a, b) =>
				parseTimestamp(a.timestamp) -
				parseTimestamp(b.timestamp),
		);
	}

	findMostRecentBefore(timestamp: string, maxAge?: number): number | null {
		const targetTime = parseTimestamp(timestamp);
		const minTime = maxAge ? targetTime - maxAge * 1000 : 0;

		// Binary search for the most recent entry before the target timestamp
		const resultIndex = findMostRecentIndexBefore(
			this.rssiEntries,
			targetTime,
			minTime,
			(entry) => parseTimestamp(entry.timestamp)
		);

		return resultIndex !== null ? this.rssiEntries[resultIndex].index : null;
	}
}

/**
 * Main class that coordinates all tool implementations and manages log data access.
 */
export class LogQueryEngine {
	private entries: SemanticLogInfo[];
	private indexes: LogIndexes;

	public constructor(transformedEntries: SemanticLogInfo[]) {
		this.entries = transformedEntries;
		this.indexes = {} as LogIndexes;
		this.buildIndexes();
	}

	private buildIndexes(): void {
		// Build timestamp index
		const byTimestamp = new Map<string, number>();
		for (let index = 0; index < this.entries.length; index++) {
			const entry = this.entries[index];
			byTimestamp.set(entry.timestamp, index);
		}

		// Build node ID index
		const byNodeId = new Map<number, number[]>();
		for (let index = 0; index < this.entries.length; index++) {
			const entry = this.entries[index];
			if ("nodeId" in entry) {
				const nodeId = entry.nodeId;
				if (!byNodeId.has(nodeId)) {
					byNodeId.set(nodeId, []);
				}
				byNodeId.get(nodeId)!.push(index);
			}
		}

		// Build entry type index
		const byEntryType = new Map<SemanticLogKind, number[]>();
		for (let index = 0; index < this.entries.length; index++) {
			const entry = this.entries[index];
			const kind = entry.kind;
			if (!byEntryType.has(kind)) {
				byEntryType.set(kind, []);
			}
			byEntryType.get(kind)!.push(index);
		}

		this.indexes = {
			byTimestamp,
			byNodeId,
			byEntryType,
			timeRangeIndex: new TimeRangeIndex(this.entries),
			textSearchIndex: new TextSearchIndex(this.entries),
			backgroundRSSIIndex: new BackgroundRSSIIndex(this.entries),
		};
	}

	// Utility methods

	/**
	 * Extract a value from an object using a dot-separated path
	 * This method is more lenient and checks both root-level and nested attributes
	 */
	private getValueByPath(obj: any, path: string): any {
		const parts = path.split(".").filter((p) => p !== "attributes");
		let current = obj;

		// First try the direct path
		for (const part of parts) {
			if (current === null || current === undefined) {
				break;
			}
			current = current[part];
		}

		// If we found a value via direct path, return it
		if (current !== undefined) {
			return current;
		}

		// If the direct path didn't work and this is a single-segment path,
		// also try looking in the attributes object
		if (parts.length === 1) {
			const attributeValue = obj?.attributes?.[parts[0]];
			if (attributeValue !== undefined) {
				return attributeValue;
			}
		}

		return undefined;
	}

	/**
	 * Apply a single attribute filter to a log entry
	 */
	private applyAttributeFilter(
		entry: SemanticLogInfo,
		filter: AttributeFilter,
	): boolean {
		const actualValue = this.getValueByPath(entry, filter.path);
		const filterValue = filter.value;

		// If the actual value is undefined/null, only match if filter expects null/undefined
		if (actualValue === undefined || actualValue === null) {
			return (
				filter.operator === "eq" &&
				(filterValue === null || filterValue === undefined)
			);
		}

		switch (filter.operator) {
			case "eq":
				return actualValue === filterValue;
			case "ne":
				return actualValue !== filterValue;
			case "gt":
				if (
					typeof actualValue === "number" &&
					typeof filterValue === "number"
				) {
					return actualValue > filterValue;
				}
				if (
					typeof actualValue === "string" &&
					typeof filterValue === "string"
				) {
					return actualValue > filterValue;
				}
				return false;
			case "gte":
				if (
					typeof actualValue === "number" &&
					typeof filterValue === "number"
				) {
					return actualValue >= filterValue;
				}
				if (
					typeof actualValue === "string" &&
					typeof filterValue === "string"
				) {
					return actualValue >= filterValue;
				}
				return false;
			case "lt":
				if (
					typeof actualValue === "number" &&
					typeof filterValue === "number"
				) {
					return actualValue < filterValue;
				}
				if (
					typeof actualValue === "string" &&
					typeof filterValue === "string"
				) {
					return actualValue < filterValue;
				}
				return false;
			case "lte":
				if (
					typeof actualValue === "number" &&
					typeof filterValue === "number"
				) {
					return actualValue <= filterValue;
				}
				if (
					typeof actualValue === "string" &&
					typeof filterValue === "string"
				) {
					return actualValue <= filterValue;
				}
				return false;
			case "match": {
				const actualStr = String(actualValue);
				const filterStr = String(filterValue);

				// Parse regex delimited syntax /pattern/flags
				let isRegex = false;
				let searchPattern = filterStr;
				let regexFlags = "i"; // Default to case-insensitive

				// Check for /pattern/flags syntax
				const regexMatch = filterStr.match(/^\/(.+?)\/([gimuy]*)$/);
				if (regexMatch) {
					isRegex = true;
					searchPattern = regexMatch[1];
					regexFlags = regexMatch[2] || "i"; // Use provided flags or default to case-insensitive
				} else {
					// Auto-detect regex patterns
					isRegex = this.isLikelyRegex(filterStr);
					searchPattern = filterStr;
				}

				if (isRegex) {
					try {
						const regex = new RegExp(searchPattern, regexFlags);
						return regex.test(actualStr);
					} catch {
						// Invalid regex, fall back to string contains
						const fallbackPattern = regexMatch
							? searchPattern.toLowerCase()
							: filterStr.toLowerCase();
						return actualStr
							.toLowerCase()
							.includes(fallbackPattern);
					}
				} else {
					return actualStr
						.toLowerCase()
						.includes(filterStr.toLowerCase());
				}
			}
			default:
				return false;
		}
	}

	/**
	 * Auto-detect if a query string looks like a regex pattern
	 */
	private isLikelyRegex(query: string): boolean {
		// Common regex patterns that suggest the user intends regex
		const regexIndicators = [
			/\|/, // Alternation (pipe)
			/\[[^\]]+\]/, // Character classes
			/\([^)]*\)/, // Groups
			/\*|\+|\?/, // Quantifiers
			/\^.*\$/, // Start/end anchors
			/\\[dwsWDS]/, // Common escape sequences
			/\.\*/, // .* pattern
			/\.\+/, // .+ pattern
		];

		return regexIndicators.some((pattern) => pattern.test(query));
	}

	/**
	 * Apply all attribute filters to a log entry
	 */
	private passesAttributeFilters(
		entry: SemanticLogInfo,
		filters: AttributeFilter[],
	): boolean {
		return filters.every((filter) =>
			this.applyAttributeFilter(entry, filter),
		);
	}

	private calculateMedian(values: number[]): number {
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		if (sorted.length % 2 === 0) {
			return (sorted[mid - 1] + sorted[mid]) / 2;
		}
		return sorted[mid];
	}

	private calculateMean(values: number[]): number {
		if (values.length === 0) return 0;
		return values.reduce((sum, val) => sum + val, 0) / values.length;
	}

	private calculateStdDev(values: number[]): number {
		if (values.length === 0) return 0;
		const mean = this.calculateMean(values);
		const variance =
			values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
			values.length;
		return Math.sqrt(variance);
	}

	private extractRSSIValue(rssiString: string): number | null {
		const match = rssiString.match(/(-?\d+)/);
		return match ? parseInt(match[1], 10) : null;
	}

	// Tool implementations will be added in subsequent methods...

	/**
	 * Get overall statistics about the entire log file
	 */
	async getLogSummary(): Promise<LogSummary> {
		if (this.entries.length === 0) {
			return {
				totalEntries: 0,
				timeRange: { start: "", end: "" },
				nodeIds: [],
				networkActivity: {
					total: { incoming: 0, outgoing: 0, total: 0 },
					byNode: {},
				},
				unsolicitedReportIntervals: null,
			};
		}

		const totalEntries = this.entries.length;
		const timeRange = {
			start: this.entries[0].timestamp,
			end: this.entries[totalEntries - 1].timestamp,
		};

		// Extract unique node IDs
		const nodeIds = Array.from(this.indexes.byNodeId.keys()).sort(
			(a, b) => a - b,
		);

		// Calculate network activity
		const networkActivity = {
			total: { incoming: 0, outgoing: 0, total: 0 },
			byNode: {} as Record<
				number,
				{ incoming: number; outgoing: number; total: number }
			>,
		};

		for (const nodeId of nodeIds) {
			networkActivity.byNode[nodeId] = {
				incoming: 0,
				outgoing: 0,
				total: 0,
			};
		}

		for (let i = 0; i < this.entries.length; i++) {
			const entry = this.entries[i];
			let direction: "incoming" | "outgoing" | null = null;
			let nodeId: number | null = null;

			if (entry.kind === "INCOMING_COMMAND") {
				direction = "incoming";
				nodeId = entry.nodeId;
			} else if (entry.kind === "SEND_DATA_REQUEST") {
				direction = "outgoing";
				nodeId = entry.nodeId;
			}

			if (direction && nodeId !== null) {
				networkActivity.total[direction]++;
				networkActivity.total.total++;

				if (networkActivity.byNode[nodeId]) {
					networkActivity.byNode[nodeId][direction]++;
					networkActivity.byNode[nodeId].total++;
				}
			}
		}

		// Calculate network-wide unsolicited report intervals
		// Collect all incoming commands (treating them as unsolicited reports) across all nodes
		const allIncomingCommands = this.entries.filter(
			(entry) => entry.kind === "INCOMING_COMMAND",
		);

		let unsolicitedReportIntervals:
			| {
					min: number;
					max: number;
					mean: number;
					median: number;
					stddev: number;
			  }
			| undefined;

		if (allIncomingCommands.length > 1) {
			const intervals: number[] = [];

			// Calculate intervals between consecutive incoming commands across the entire network
			for (let i = 1; i < allIncomingCommands.length; i++) {
				const prevTime = parseTimestamp(
					allIncomingCommands[i - 1].timestamp,
				);
				const currTime = parseTimestamp(
					allIncomingCommands[i].timestamp,
				);
				intervals.push((currTime - prevTime) / 1000); // Convert to seconds
			}

			if (intervals.length > 0) {
				unsolicitedReportIntervals = {
					min: Math.min(...intervals),
					max: Math.max(...intervals),
					mean: Math.round(this.calculateMean(intervals) * 100) / 100,
					median: this.calculateMedian(intervals),
					stddev:
						Math.round(this.calculateStdDev(intervals) * 100) / 100,
				};
			}
		}

		return {
			totalEntries,
			timeRange,
			nodeIds,
			networkActivity,
			unsolicitedReportIntervals: unsolicitedReportIntervals || null,
		};
	}

	/**
	 * Summarize traffic and signal quality for a specific node over time
	 */
	async getNodeSummary(args: GetNodeSummaryArgs): Promise<NodeSummary> {
		const { nodeId, timeRange } = args;

		// Get all entries for this node
		const nodeEntryIndices = this.indexes.byNodeId.get(nodeId) || [];
		let filteredIndices = nodeEntryIndices;

		// Apply time range filter if specified using TimeRangeIndex for efficiency
		if (timeRange) {
			const timeRangeIndices =
				this.indexes.timeRangeIndex.findEntriesInRange(
					timeRange.start,
					timeRange.end,
				);
			// Find intersection of node entries and time range entries
			const timeRangeSet = new Set(timeRangeIndices);
			filteredIndices = nodeEntryIndices.filter((index) =>
				timeRangeSet.has(index),
			);
		}

		const filteredEntries = filteredIndices.map((i) => this.entries[i]);

		if (filteredEntries.length === 0) {
			const defaultTimeRange = timeRange || {
				start: this.entries[0]?.timestamp || "",
				end: this.entries[this.entries.length - 1]?.timestamp || "",
			};

			return {
				nodeId,
				timeRange: defaultTimeRange,
				commandCounts: { incoming: 0, outgoing: 0, total: 0 },
				commandClasses: [],
			};
		}

		const actualTimeRange = {
			start: filteredEntries[0].timestamp,
			end: filteredEntries[filteredEntries.length - 1].timestamp,
		};

		// Collect RSSI values from incoming commands
		const rssiValues: number[] = [];
		for (let i = 0; i < filteredEntries.length; i++) {
			const entry = filteredEntries[i];
			if (entry.kind === "INCOMING_COMMAND" && entry.rssi) {
				const rssi = this.extractRSSIValue(entry.rssi);
				if (rssi !== null) {
					rssiValues.push(rssi);
				}
			}
		}

		// Calculate RSSI statistics
		const rssiStatistics =
			rssiValues.length > 0
				? {
						min: Math.min(...rssiValues),
						max: Math.max(...rssiValues),
						mean:
							Math.round(this.calculateMean(rssiValues) * 100) /
							100,
						median: this.calculateMedian(rssiValues),
						stddev:
							Math.round(this.calculateStdDev(rssiValues) * 100) /
							100,
					}
				: undefined;

		// Calculate command counts
		let incoming = 0,
			outgoing = 0;
		for (let i = 0; i < filteredEntries.length; i++) {
			const entry = filteredEntries[i];
			if (entry.kind === "INCOMING_COMMAND") {
				incoming++;
			} else if (entry.kind === "SEND_DATA_REQUEST") {
				outgoing++;
			}
		}

		const commandCounts = {
			incoming,
			outgoing,
			total: incoming + outgoing,
		};

		// Calculate unsolicited report intervals
		// Treat all incoming commands as unsolicited reports for better traffic understanding
		const incomingCommands = filteredEntries.filter(
			(entry) => entry.kind === "INCOMING_COMMAND",
		);

		// Use all incoming commands as unsolicited reports (no filtering)
		const unsolicitedReports = incomingCommands;

		// Calculate intervals between unsolicited reports
		// This includes intervals from time range start to first report,
		// between consecutive reports, and from last report to time range end
		const intervals: number[] = [];

		if (unsolicitedReports.length > 0) {
			// Determine the actual time range we're analyzing
			// Use the provided time range if available, otherwise use the full range of all entries
			const analysisTimeRange = timeRange || {
				start: this.entries[0]?.timestamp || "",
				end: this.entries[this.entries.length - 1]?.timestamp || "",
			};

			// Only proceed if we have valid time range bounds
			if (analysisTimeRange.start && analysisTimeRange.end) {
				const rangeStartTime = parseTimestamp(
					analysisTimeRange.start,
				);
				const rangeEndTime = parseTimestamp(analysisTimeRange.end);

				// Add interval from time range start to first unsolicited report
				const firstReportTime = parseTimestamp(
					unsolicitedReports[0].timestamp,
				);
				if (firstReportTime > rangeStartTime) {
					intervals.push((firstReportTime - rangeStartTime) / 1000);
				}

				// Add intervals between consecutive unsolicited reports
				for (let i = 1; i < unsolicitedReports.length; i++) {
					const prevTime = parseTimestamp(
						unsolicitedReports[i - 1].timestamp,
					);
					const currTime = parseTimestamp(
						unsolicitedReports[i].timestamp,
					);
					intervals.push((currTime - prevTime) / 1000); // Convert to seconds
				}

				// Add interval from last unsolicited report to time range end
				const lastReportTime = parseTimestamp(
					unsolicitedReports[unsolicitedReports.length - 1].timestamp,
				);
				if (rangeEndTime > lastReportTime) {
					intervals.push((rangeEndTime - lastReportTime) / 1000);
				}
			}
		}

		const unsolicitedReportIntervals =
			intervals.length > 0
				? {
						min: Math.min(...intervals),
						max: Math.max(...intervals),
						mean:
							Math.round(this.calculateMean(intervals) * 100) /
							100,
						median: this.calculateMedian(intervals),
						stddev:
							Math.round(this.calculateStdDev(intervals) * 100) /
							100,
					}
				: undefined;

		// Extract and collect command classes used by the node
		const commandClassesSet = new Set<string>();

		for (let i = 0; i < filteredEntries.length; i++) {
			const entry = filteredEntries[i];
			let commandClass: string | undefined;

			if (
				entry.kind === "INCOMING_COMMAND" ||
				entry.kind === "SEND_DATA_REQUEST"
			) {
				// Try to extract command class from payload
				if (entry.payload?.message) {
					// Check if message has square brackets, if so extract from within
					const match = entry.payload.message.match(/\[([^\]]+)\]/);
					if (match) {
						commandClass = match[1];
					} else {
						// Use the message directly if no square brackets
						commandClass = entry.payload.message;
					}
				} else if (entry.payload?.nested?.message) {
					const match =
						entry.payload.nested.message.match(/\[([^\]]+)\]/);
					if (match) {
						commandClass = match[1];
					} else {
						commandClass = entry.payload.nested.message;
					}
				}
			} else if (
				entry.kind === "VALUE_ADDED" ||
				entry.kind === "VALUE_UPDATED" ||
				entry.kind === "VALUE_REMOVED" ||
				entry.kind === "METADATA_UPDATED"
			) {
				commandClass = entry.commandClass;
			}

			if (commandClass) {
				commandClassesSet.add(commandClass);
			}
		}

		// Apply transport CC merging rules
		const commandClasses: string[] = [];
		const hasSecurityS2 = Array.from(commandClassesSet).some((cc) =>
			/Security2CC.*/.test(cc),
		);
		const hasSecurityS0 = Array.from(commandClassesSet).some((cc) =>
			/SecurityCC.*/.test(cc),
		);
		const hasTransportService = Array.from(commandClassesSet).some((cc) =>
			/TransportServiceCC.*/.test(cc),
		);
		const hasSupervision = Array.from(commandClassesSet).some((cc) =>
			/SupervisionCC.*/.test(cc),
		);
		const hasMultiCommand = Array.from(commandClassesSet).some((cc) =>
			/MultiCommandCC.*/.test(cc),
		);

		// Add merged transport CCs
		if (hasSecurityS2) commandClasses.push("Security S2");
		if (hasSecurityS0) commandClasses.push("Security S0");
		if (hasTransportService) commandClasses.push("Transport Service");
		if (hasSupervision) commandClasses.push("Supervision");
		if (hasMultiCommand) commandClasses.push("Multi Command");

		// Add other command classes (exclude the ones we merged)
		for (const cc of commandClassesSet) {
			if (
				!/Security2CC.*|SecurityCC.*|TransportServiceCC.*|SupervisionCC.*|MultiCommandCC.*/.test(
					cc,
				)
			) {
				commandClasses.push(cc);
			}
		}

		// Sort command classes alphabetically
		commandClasses.sort();

		return {
			nodeId,
			timeRange: actualTimeRange,
			rssiStatistics,
			commandCounts,
			unsolicitedReportIntervals,
			commandClasses,
		};
	}

	/**
	 * Enumerate communication attempts with a specific node over a specified time range
	 */
	async getNodeCommunication(
		args: GetNodeCommunicationArgs,
	): Promise<NodeCommunication> {
		const {
			nodeId,
			timeRange,
			direction = "both",
			limit = 100,
			offset = 0,
		} = args;

		// Get all entries for this node
		const nodeEntryIndices = this.indexes.byNodeId.get(nodeId) || [];
		let filteredIndices = nodeEntryIndices;

		// Apply time range filter if specified using TimeRangeIndex for efficiency
		if (timeRange) {
			const timeRangeIndices =
				this.indexes.timeRangeIndex.findEntriesInRange(
					timeRange.start,
					timeRange.end,
				);
			// Find intersection of node entries and time range entries
			const timeRangeSet = new Set(timeRangeIndices);
			filteredIndices = nodeEntryIndices.filter((index) =>
				timeRangeSet.has(index),
			);
		}

		const filteredEntries = filteredIndices.map((i) => ({
			entry: this.entries[i],
			index: i,
		}));

		// Filter by direction and collect communication events
		const communicationEvents: Array<{
			timestamp: string;
			direction: "incoming" | "outgoing";
			rssi?: string;
			commandClass?: string;
			callbackId?: number;
			transmitOptions?: string[];
			transmitStatus?: string;
			routingAttempts?: number;
			ackRSSI?: string;
			txPower?: string;
		}> = [];

		// Track callback IDs to match requests with callbacks
		const callbackMap = new Map<
			number,
			{
				requestIndex: number;
				callbackIndex?: number;
			}
		>();

		// First pass: collect all relevant entries and build callback map
		for (let i = 0; i < filteredEntries.length; i++) {
			const { entry, index } = filteredEntries[i];
			if (entry.kind === "SEND_DATA_REQUEST") {
				callbackMap.set(entry.callbackId, { requestIndex: index });
			} else if (entry.kind === "SEND_DATA_CALLBACK") {
				const existing = callbackMap.get(entry.callbackId);
				if (existing) {
					existing.callbackIndex = index;
				}
			}
		}

		// Second pass: create communication events
		for (let i = 0; i < filteredEntries.length; i++) {
			const { entry } = filteredEntries[i];
			if (entry.kind === "INCOMING_COMMAND") {
				if (direction === "incoming" || direction === "both") {
					// Extract command class from payload
					let commandClass: string | undefined;
					if (entry.payload?.message) {
						// Try to extract command class from message
						const match =
							entry.payload.message.match(/\[([^\]]+)\]/);
						if (match) {
							commandClass = match[1];
						}
					} else if (entry.payload?.nested?.message) {
						const match =
							entry.payload.nested.message.match(/\[([^\]]+)\]/);
						if (match) {
							commandClass = match[1];
						}
					}

					communicationEvents.push({
						timestamp: entry.timestamp,
						direction: "incoming",
						rssi: entry.rssi,
						commandClass,
					});
				}
			} else if (entry.kind === "SEND_DATA_REQUEST") {
				if (direction === "outgoing" || direction === "both") {
					const callbackInfo = callbackMap.get(entry.callbackId);
					let transmitStatus: string | undefined;
					let routingAttempts: number | undefined;
					let ackRSSI: string | undefined;
					let txPower: string | undefined;

					// If we have a matching callback, extract transmission details
					if (callbackInfo?.callbackIndex !== undefined) {
						const callback =
							this.entries[callbackInfo.callbackIndex];
						if (callback.kind === "SEND_DATA_CALLBACK") {
							if (callback.attributes["transmit status"]) {
								transmitStatus = String(
									callback.attributes["transmit status"],
								);
							}
							if (callback.attributes["routing attempts"]) {
								routingAttempts = Number(
									callback.attributes["routing attempts"],
								);
							}
							if (callback.attributes["ACK RSSI"]) {
								ackRSSI = String(
									callback.attributes["ACK RSSI"],
								);
							}
							if (callback.attributes["TX power"]) {
								txPower = String(
									callback.attributes["TX power"],
								);
							}
						}
					}

					communicationEvents.push({
						timestamp: entry.timestamp,
						direction: "outgoing",
						callbackId: entry.callbackId,
						transmitOptions: entry.transmitOptions,
						transmitStatus,
						routingAttempts,
						ackRSSI,
						txPower,
					});
				}
			}
		}

		// No need to sort since entries are already ordered by timestamp

		// Apply pagination
		const totalCount = communicationEvents.length;
		const paginatedEvents = communicationEvents.slice(
			offset,
			offset + limit,
		);

		return {
			nodeId,
			events: paginatedEvents,
			totalCount,
			hasMore: offset + limit < totalCount,
		};
	}

	/**
	 * Search log entries by keyword/text/regex with optional type filtering
	 */
	async searchLogEntries(args: SearchLogEntriesArgs): Promise<SearchResults> {
		const {
			query,
			entryKinds,
			timeRange,
			attributeFilters,
			limit = 100,
			offset = 0,
		} = args;

		// Validate that at least one of the required parameters is provided
		const hasQuery = typeof query === "string" && query.trim().length > 0;
		const hasEntryKinds = Array.isArray(entryKinds) && entryKinds.length > 0;
		const hasTimeRange = timeRange && typeof timeRange === "object" && timeRange.start && timeRange.end;
		const hasAttributeFilters = Array.isArray(attributeFilters) && attributeFilters.length > 0;

		if (!hasQuery && !hasEntryKinds && !hasTimeRange && !hasAttributeFilters) {
			return {
				query: query || "",
				matches: [],
				totalMatches: 0,
				hasMore: false,
				error: "At least one of the following parameters must be provided: query, entryKinds, timeRange, or attributeFilters"
			};
		}

		// Start with text search results or all entries if no query
		let searchIndices: number[];
		if (hasQuery) {
			searchIndices = this.indexes.textSearchIndex.search(query);
		} else {
			// If no query, start with all entries
			searchIndices = Array.from({ length: this.entries.length }, (_, i) => i);
		}

		// Apply time range filter using TimeRangeIndex for efficiency
		if (hasTimeRange) {
			const timeRangeIndices =
				this.indexes.timeRangeIndex.findEntriesInRange(
					timeRange.start,
					timeRange.end,
				);
			const timeRangeSet = new Set(timeRangeIndices);
			searchIndices = searchIndices.filter((index) =>
				timeRangeSet.has(index),
			);
		}

		// Apply entry kind filter if specified
		if (hasEntryKinds) {
			searchIndices = searchIndices.filter((index: number) => {
				const entry = this.entries[index];
				// Allow substring matching - check if any provided kind is a substring of the actual entry kind
				return entryKinds.some(
					(filterKind) =>
						entry.kind === filterKind ||
						entry.kind.includes(filterKind),
				);
			});
		}

		// Apply attribute filters if specified
		if (hasAttributeFilters) {
			searchIndices = searchIndices.filter((index: number) => {
				const entry = this.entries[index];
				return this.passesAttributeFilters(entry, attributeFilters);
			});
		}

		// No need to sort since entries are already ordered by timestamp

		// Apply pagination
		const totalMatches = searchIndices.length;
		const paginatedIndices = searchIndices.slice(offset, offset + limit);
		const paginatedMatches = paginatedIndices.map((i: number) => this.entries[i]);

		return {
			query: query || "",
			matches: paginatedMatches,
			totalMatches,
			hasMore: offset + limit < totalMatches,
		};
	}

	/**
	 * Enumerate all log entries around a specific timestamp with optional type filtering
	 */
	async getEventsAroundTimestamp(
		args: GetEventsAroundTimestampArgs,
	): Promise<EventsAroundTimestamp> {
		const {
			timestamp,
			beforeSeconds = 30,
			afterSeconds = 30,
			entryKinds,
			limit = 100,
			offset = 0,
		} = args;

		// Calculate time window
		const targetTime = parseTimestamp(timestamp);
		const startTime = targetTime - beforeSeconds * 1000;
		const endTime = targetTime + afterSeconds * 1000;

		const timeWindow = {
			start: new Date(startTime).toISOString(),
			end: new Date(endTime).toISOString(),
		};

		// Find entries in the time range using TimeRangeIndex
		const timeRangeIndices = this.indexes.timeRangeIndex.findEntriesInRange(
			timeWindow.start,
			timeWindow.end,
		);

		// Apply entry kind filter if specified
		let filteredIndices = timeRangeIndices;
		if (entryKinds && entryKinds.length > 0) {
			filteredIndices = timeRangeIndices.filter((index: number) => {
				const entry = this.entries[index];
				// Allow substring matching - check if any provided kind is a substring of the actual entry kind
				return entryKinds.some(
					(filterKind) =>
						entry.kind === filterKind ||
						entry.kind.includes(filterKind),
				);
			});
		}

		// No need to sort since entries are already ordered by timestamp

		// Apply pagination
		const totalCount = filteredIndices.length;
		const paginatedIndices = filteredIndices.slice(offset, offset + limit);
		const paginatedEvents = paginatedIndices.map((i: number) => this.entries[i]);

		return {
			targetTimestamp: timestamp,
			timeWindow,
			events: paginatedEvents,
			totalCount,
			hasMore: offset + limit < totalCount,
		};
	}

	/**
	 * Retrieve the most recent background RSSI reading before a specific timestamp
	 */
	async getBackgroundRSSIBefore(
		args: GetBackgroundRSSIBeforeArgs,
	): Promise<BackgroundRSSIReading | undefined> {
		const { timestamp, maxAge, channel } = args;

		const rssiIndex = this.indexes.backgroundRSSIIndex.findMostRecentBefore(
			timestamp,
			maxAge,
		);

		if (rssiIndex === null) {
			return undefined;
		}

		const rssiEntry = this.entries[rssiIndex];
		const targetTime = parseTimestamp(timestamp);
		const rssiTime = parseTimestamp(rssiEntry.timestamp);
		const age = Math.round((targetTime - rssiTime) / 1000); // Convert to seconds

		if (rssiEntry.kind === "BACKGROUND_RSSI") {
			// Single measurement
			const channels: Record<string, { value?: number }> = {};

			// Process all channel data, optionally filtering by specific channel
			for (const [key, value] of Object.entries(rssiEntry)) {
				if (key === "kind" || key === "timestamp") continue;
				if (typeof value !== "string") continue;

				if (channel !== undefined) {
					// Only include the specified channel
					if (key === `channel ${channel}`) {
						const rssiValue = this.extractRSSIValue(value);
						if (rssiValue !== null) {
							channels[key] = { value: rssiValue };
						}
					}
				} else {
					// Include all channels
					const rssiValue = this.extractRSSIValue(value);
					if (rssiValue !== null) {
						channels[key] = { value: rssiValue };
					}
				}
			}

			return {
				timestamp: rssiEntry.timestamp,
				age,
				type: "single",
				channels,
			};
		} else if (rssiEntry.kind === "BACKGROUND_RSSI_SUMMARY") {
			// Summary measurement
			const channels: Record<
				string,
				{
					min?: number;
					max?: number;
					mean?: number;
					median?: number;
					stddev?: number;
				}
			> = {};

			// Process summary data
			for (const [key, value] of Object.entries(rssiEntry)) {
				if (
					key === "kind" ||
					key === "timestamp" ||
					key === "samples" ||
					key === "time_range"
				)
					continue;
				if (typeof value !== "object" || value === null) continue;

				if (channel !== undefined) {
					// Only include the specified channel
					if (key === `channel ${channel}`) {
						const channelData = value as any;
						channels[key] = {
							min: channelData.min?.value,
							max: channelData.max?.value,
							mean: channelData.mean,
							median: channelData.median,
							stddev: channelData.stddev,
						};
					}
				} else {
					// Include all channels
					const channelData = value as any;
					channels[key] = {
						min: channelData.min?.value,
						max: channelData.max?.value,
						mean: channelData.mean,
						median: channelData.median,
						stddev: channelData.stddev,
					};
				}
			}

			return {
				timestamp: rssiEntry.timestamp,
				age,
				type: "summary",
				channels,
			};
		}

		return undefined;
	}

	/**
	 * Read specific ranges of log entries by index with pagination support
	 */
	async getLogChunk(args: GetLogChunkArgs): Promise<LogChunk> {
		const { startIndex, count } = args;
		const totalEntries = this.entries.length;

		if (startIndex < 0 || startIndex >= totalEntries) {
			return {
				entries: [],
				startIndex,
				endIndex: startIndex,
				totalEntries,
				hasMore: false,
			};
		}

		const endIndex = Math.min(startIndex + count, totalEntries);
		const entries = this.entries.slice(startIndex, endIndex);

		return {
			entries,
			startIndex,
			endIndex: endIndex - 1,
			totalEntries,
			hasMore: endIndex < totalEntries,
		};
	}
}
