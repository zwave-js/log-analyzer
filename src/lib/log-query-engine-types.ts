import type { SemanticLogKind, SemanticLogInfo } from "./types.js";

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
	entryTypes?: SemanticLogKind[];
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
	query: string;
	entryTypes?: SemanticLogKind[];
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

export abstract class TimeRangeIndex {
	abstract findEntriesInRange(start: string, end: string): number[];
	abstract findEntriesAroundTimestamp(
		timestamp: string,
		windowSeconds: number,
	): number[];
}

export abstract class TextSearchIndex {
	abstract search(query: string): number[];
}

export abstract class BackgroundRSSIIndex {
	abstract findMostRecentBefore(
		timestamp: string,
		maxAge?: number,
	): number | null;
}
