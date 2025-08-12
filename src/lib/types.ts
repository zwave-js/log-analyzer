import { type DataDirection } from "@zwave-js/core";

export type UnformattedLogInfo = {
	timestamp: string;
	label: string;
	direction: DataDirection;
	primaryTags?: string[];
	message: string | LogInfoPayload;
	secondaryTags?: string;
};

export type LogInfoPayload = {
	message: string;
	attributes?: Record<string, string | number | boolean>;
	nested?: LogInfoPayload;
};

export const SemanticLogKind = {
	IncomingCommand: "INCOMING_COMMAND",
	SendDataRequest: "SEND_DATA_REQUEST",
	SendDataResponse: "SEND_DATA_RESPONSE",
	SendDataCallback: "SEND_DATA_CALLBACK",
	Request: "REQUEST",
	Response: "RESPONSE",
	Callback: "CALLBACK",
	ValueAdded: "VALUE_ADDED",
	ValueUpdated: "VALUE_UPDATED",
	ValueRemoved: "VALUE_REMOVED",
	MetadataUpdated: "METADATA_UPDATED",
	// Used for all log entries where we know the general kind, but not what it is
	Other: "OTHER",
} as const;

export type SemanticLogKind =
	(typeof SemanticLogKind)[keyof typeof SemanticLogKind];

export type SemanticLogInfo = {
	timestamp: string;
} & (
	| {
			kind: "INCOMING_COMMAND";
			nodeId: number;
			rssi?: string;
			invalid?: boolean;
			payload: LogInfoPayload;
	  }
	| {
			kind: "SEND_DATA_REQUEST";
			nodeId: number;
			transmitOptions: string;
			callbackId: number;
			payload: LogInfoPayload;
	  }
	| {
			kind: "SEND_DATA_RESPONSE";
			success: boolean;
	  }
	| {
			kind: "SEND_DATA_CALLBACK";
			callbackId: number;
			attributes: Record<string, string | number | boolean>;
	  }
	| {
			kind: "VALUE_ADDED";
			nodeId: number;
			endpointIndex?: number;
			commandClass: string;
			property: string;
			propertyKey?: string;
			value: string | number | boolean;
	  }
	| {
			kind: "VALUE_UPDATED";
			nodeId: number;
			endpointIndex?: number;
			commandClass: string;
			property: string;
			propertyKey?: string;
			prevValue: string | number | boolean;
			value: string | number | boolean;
	  }
	| {
			kind: "VALUE_REMOVED";
			nodeId: number;
			endpointIndex?: number;
			commandClass: string;
			property: string;
			propertyKey?: string;
			prevValue: string | number | boolean;
	  }
	| {
			kind: "METADATA_UPDATED";
			nodeId: number;
			endpointIndex?: number;
			commandClass: string;
			property: string;
			propertyKey?: string;
	  }
	// Used for all log entries where we know the general kind, but not what it is
	| ({
			kind: "REQUEST" | "RESPONSE" | "CALLBACK";
	  } & Omit<UnformattedLogInfo, "label">)
	// Used for all log entries that have not been classified
	| ({
			kind: "OTHER";
	  } & UnformattedLogInfo)
);

export interface TransformedLog {
	entries: SemanticLogInfo[];
}

export interface AnalysisRequest {
	transformedLog: TransformedLog;
	query: string;
	systemPrompt: string;
}

export interface AnalysisResponse {
	content: string;
	tokenCount: number;
}

export interface GeminiConfig {
	apiKey: string;
	model: string;
}

export interface GeminiFileInfo {
	name: string;
	uri: string;
	mimeType: string;
}
