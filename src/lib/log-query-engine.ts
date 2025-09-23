import type { SemanticLogInfo, SemanticLogKind } from "./types.js";
import {
	TimeRangeIndex,
	TextSearchIndex,
	BackgroundRSSIIndex,
} from "./log-query-engine-types.js";
import type {
	LogIndexes,
	LogSummary,
	NodeSummary,
	NodeCommunication,
	EventsAroundTimestamp,
	BackgroundRSSIReading,
	SearchResults,
	LogChunk,
	GetNodeSummaryArgs,
	GetNodeCommunicationArgs,
	GetEventsAroundTimestampArgs,
	GetBackgroundRSSIBeforeArgs,
	SearchLogEntriesArgs,
	GetLogChunkArgs,
} from "./log-query-engine-types.js";

class TimeRangeIndexImpl extends TimeRangeIndex {
	private buckets: Map<string, number[]> = new Map();
	private entries: SemanticLogInfo[];

	constructor(entries: SemanticLogInfo[]) {
		super();
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

	private parseTimestamp(timestamp: string): number {
		return new Date(timestamp).getTime();
	}

	findEntriesInRange(start: string, end: string): number[] {
		const startTime = this.parseTimestamp(start);
		const endTime = this.parseTimestamp(end);
		const indices: number[] = [];

		// Since entries are already sorted by timestamp, use binary search for efficiency
		const startIndex = this.findFirstIndexAtOrAfter(startTime);
		const endIndex = this.findLastIndexAtOrBefore(endTime);

		for (let i = startIndex; i <= endIndex; i++) {
			indices.push(i);
		}

		return indices;
	}

	private findFirstIndexAtOrAfter(targetTime: number): number {
		let left = 0;
		let right = this.entries.length - 1;
		let result = this.entries.length;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const entryTime = this.parseTimestamp(this.entries[mid].timestamp);

			if (entryTime >= targetTime) {
				result = mid;
				right = mid - 1;
			} else {
				left = mid + 1;
			}
		}

		return result;
	}

	private findLastIndexAtOrBefore(targetTime: number): number {
		let left = 0;
		let right = this.entries.length - 1;
		let result = -1;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const entryTime = this.parseTimestamp(this.entries[mid].timestamp);

			if (entryTime <= targetTime) {
				result = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		return result;
	}

	findEntriesAroundTimestamp(
		timestamp: string,
		windowSeconds: number,
	): number[] {
		const targetTime = this.parseTimestamp(timestamp);
		const startTime = targetTime - windowSeconds * 1000;
		const endTime = targetTime + windowSeconds * 1000;

		const indices: number[] = [];

		for (let i = 0; i < this.entries.length; i++) {
			const entryTime = this.parseTimestamp(this.entries[i].timestamp);
			if (entryTime >= startTime && entryTime <= endTime) {
				indices.push(i);
			}
		}

		return indices;
	}
}

class TextSearchIndexImpl extends TextSearchIndex {
	private contentMap: Map<number, string> = new Map();

	constructor(entries: SemanticLogInfo[]) {
		super();
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
		const parts: string[] = [entry.timestamp, entry.kind];

		// Extract node ID if present
		if ("nodeId" in entry) {
			parts.push(`node ${entry.nodeId}`);
		}

		// Extract message content based on entry type
		if (
			entry.kind === "INCOMING_COMMAND" ||
			entry.kind === "SEND_DATA_REQUEST"
		) {
			if (entry.payload) {
				parts.push(this.extractPayloadText(entry.payload));
			}
		} else if ("message" in entry) {
			if (typeof entry.message === "string") {
				parts.push(entry.message);
			} else if (typeof entry.message === "object") {
				parts.push(this.extractPayloadText(entry.message));
			}
		}

		// Add other relevant properties
		if ("rssi" in entry && entry.rssi) {
			parts.push(entry.rssi);
		}
		if ("commandClass" in entry && entry.commandClass) {
			parts.push(entry.commandClass);
		}
		if ("property" in entry && entry.property) {
			parts.push(entry.property);
		}

		return parts.join(" ");
	}

	private extractPayloadText(payload: any): string {
		if (typeof payload === "string") {
			return payload;
		}
		if (typeof payload === "object" && payload !== null) {
			const parts: string[] = [];
			if (payload.message) {
				parts.push(payload.message);
			}
			if (payload.attributes) {
				for (const [key, value] of Object.entries(payload.attributes)) {
					parts.push(`${key}: ${value}`);
				}
			}
			if (payload.nested) {
				parts.push(this.extractPayloadText(payload.nested));
			}
			return parts.join(" ");
		}
		return String(payload);
	}

	search(query: string, isRegex: boolean): number[] {
		const indices: number[] = [];
		const searchTerm = query.toLowerCase();

		if (isRegex) {
			try {
				const regex = new RegExp(searchTerm, "i");
				for (const [index, content] of this.contentMap.entries()) {
					if (regex.test(content)) {
						indices.push(index);
					}
				}
			} catch {
				// Invalid regex, fall back to plain text search
				for (const [index, content] of this.contentMap.entries()) {
					if (content.includes(searchTerm)) {
						indices.push(index);
					}
				}
			}
		} else {
			for (const [index, content] of this.contentMap.entries()) {
				if (content.includes(searchTerm)) {
					indices.push(index);
				}
			}
		}

		return indices;
	}
}

class BackgroundRSSIIndexImpl extends BackgroundRSSIIndex {
	private rssiEntries: Array<{ timestamp: string; index: number }> = [];

	constructor(entries: SemanticLogInfo[]) {
		super();
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
				new Date(a.timestamp).getTime() -
				new Date(b.timestamp).getTime(),
		);
	}

	private parseTimestamp(timestamp: string): number {
		return new Date(timestamp).getTime();
	}

	findMostRecentBefore(timestamp: string, maxAge?: number): number | null {
		const targetTime = this.parseTimestamp(timestamp);
		const minTime = maxAge ? targetTime - maxAge * 1000 : 0;

		// Binary search for the most recent entry before the target timestamp
		let left = 0;
		let right = this.rssiEntries.length - 1;
		let result: number | null = null;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const entryTime = this.parseTimestamp(
				this.rssiEntries[mid].timestamp,
			);

			if (entryTime < targetTime && entryTime >= minTime) {
				result = this.rssiEntries[mid].index;
				left = mid + 1; // Look for a more recent entry
			} else if (entryTime >= targetTime) {
				right = mid - 1;
			} else {
				left = mid + 1;
			}
		}

		return result;
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
			timeRangeIndex: new TimeRangeIndexImpl(this.entries),
			textSearchIndex: new TextSearchIndexImpl(this.entries),
			backgroundRSSIIndex: new BackgroundRSSIIndexImpl(this.entries),
		};
	}

	// Utility methods
	private parseTimestamp(timestamp: string): number {
		return new Date(timestamp).getTime();
	}

	private calculateMedian(values: number[]): number {
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		if (sorted.length % 2 === 0) {
			return (sorted[mid - 1] + sorted[mid]) / 2;
		}
		return sorted[mid];
	}

	private calculateStdDev(values: number[]): number {
		if (values.length === 0) return 0;
		const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
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

		return {
			totalEntries,
			timeRange,
			nodeIds,
			networkActivity,
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
				rssiStatistics: { min: 0, max: 0, median: 0, stddev: 0 },
				commandCounts: { incoming: 0, outgoing: 0, total: 0 },
				unsolicitedReportIntervals: {
					min: 0,
					max: 0,
					median: 0,
					stddev: 0,
				},
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
						median: this.calculateMedian(rssiValues),
						stddev:
							Math.round(this.calculateStdDev(rssiValues) * 100) /
							100,
					}
				: { min: 0, max: 0, median: 0, stddev: 0 };

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
		// Find incoming commands that are not responses to outgoing requests
		const incomingCommands = filteredEntries.filter(
			(entry) => entry.kind === "INCOMING_COMMAND",
		);

		// Find outgoing requests to identify which incoming commands are responses
		const outgoingRequests = filteredEntries.filter(
			(entry) => entry.kind === "SEND_DATA_REQUEST",
		);

		// Identify unsolicited reports (incoming commands not preceded by an outgoing request within a reasonable time)
		const unsolicitedReports: typeof incomingCommands = [];
		const timeWindow = 5000; // 5 seconds

		for (let i = 0; i < incomingCommands.length; i++) {
			const incoming = incomingCommands[i];
			const incomingTime = this.parseTimestamp(incoming.timestamp);
			let hasRecentRequest = false;

			for (let j = 0; j < outgoingRequests.length; j++) {
				const request = outgoingRequests[j];
				const requestTime = this.parseTimestamp(request.timestamp);
				if (
					requestTime < incomingTime &&
					incomingTime - requestTime <= timeWindow
				) {
					hasRecentRequest = true;
					break;
				}
			}

			if (!hasRecentRequest) {
				unsolicitedReports.push(incoming);
			}
		}

		// Calculate intervals between unsolicited reports
		const intervals: number[] = [];
		for (let i = 1; i < unsolicitedReports.length; i++) {
			const prevTime = this.parseTimestamp(
				unsolicitedReports[i - 1].timestamp,
			);
			const currTime = this.parseTimestamp(
				unsolicitedReports[i].timestamp,
			);
			intervals.push((currTime - prevTime) / 1000); // Convert to seconds
		}

		const unsolicitedReportIntervals =
			intervals.length > 0
				? {
						min: Math.min(...intervals),
						max: Math.max(...intervals),
						median: this.calculateMedian(intervals),
						stddev:
							Math.round(this.calculateStdDev(intervals) * 100) /
							100,
					}
				: { min: 0, max: 0, median: 0, stddev: 0 };

		return {
			nodeId,
			timeRange: actualTimeRange,
			rssiStatistics,
			commandCounts,
			unsolicitedReportIntervals,
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
			transmitOptions?: string;
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
	 * Auto-detect if a query string looks like a regex pattern
	 */
	private isLikelyRegex(query: string): boolean {
		// Common regex patterns that suggest the user intends regex
		const regexIndicators = [
			/\|/,           // Alternation (pipe)
			/\[[^\]]+\]/,   // Character classes
			/\([^)]*\)/,    // Groups
			/\*|\+|\?/,     // Quantifiers
			/\^.*\$/,       // Start/end anchors
			/\\[dwsWDS]/,   // Common escape sequences
			/\.\*/,         // .* pattern
			/\.\+/,         // .+ pattern
		];
		
		return regexIndicators.some(pattern => pattern.test(query));
	}

	/**
	 * Search log entries by keyword/text/regex with optional type filtering
	 */
	async searchLogEntries(args: SearchLogEntriesArgs): Promise<SearchResults> {
		const {
			query,
			isRegex = false,
			entryTypes,
			timeRange,
			limit = 100,
			offset = 0,
		} = args;

		// Auto-detect regex if not explicitly specified
		const shouldUseRegex = isRegex || this.isLikelyRegex(query);

		// Start with text search results
		let searchIndices = this.indexes.textSearchIndex.search(query, shouldUseRegex);

		// Apply time range filter using TimeRangeIndex for efficiency
		if (timeRange) {
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

		// Apply entry type filter if specified
		if (entryTypes && entryTypes.length > 0) {
			const typeSet = new Set(entryTypes);
			searchIndices = searchIndices.filter((index) => {
				const entry = this.entries[index];
				return typeSet.has(entry.kind);
			});
		}

		// No need to sort since entries are already ordered by timestamp

		// Apply pagination
		const totalMatches = searchIndices.length;
		const paginatedIndices = searchIndices.slice(offset, offset + limit);
		const paginatedMatches = paginatedIndices.map((i) => this.entries[i]);

		return {
			query,
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
			entryTypes,
			limit = 100,
			offset = 0,
		} = args;

		// Calculate time window
		const targetTime = this.parseTimestamp(timestamp);
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

		// Apply entry type filter if specified
		let filteredIndices = timeRangeIndices;
		if (entryTypes && entryTypes.length > 0) {
			const typeSet = new Set(entryTypes);
			filteredIndices = timeRangeIndices.filter((index) => {
				const entry = this.entries[index];
				return typeSet.has(entry.kind);
			});
		}

		// No need to sort since entries are already ordered by timestamp

		// Apply pagination
		const totalCount = filteredIndices.length;
		const paginatedIndices = filteredIndices.slice(offset, offset + limit);
		const paginatedEvents = paginatedIndices.map((i) => this.entries[i]);

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
		const targetTime = this.parseTimestamp(timestamp);
		const rssiTime = this.parseTimestamp(rssiEntry.timestamp);
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
