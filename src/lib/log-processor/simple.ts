import { SemanticLogKind } from "../types";
import type { 
	SemanticLogInfo, 
	TransformedLog 
} from "../types";

const TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/;

/** Main pipeline class that processes log content through all transform stages */
export class LogTransformPipeline {
	async processLogContent(logContent: string): Promise<SemanticLogInfo[]> {
		const entries: SemanticLogInfo[] = [];
		
		// Simple processing for now - just split by lines and parse basic structure
		const lines = logContent.split('\n').filter(line => line.trim());
		
		for (const line of lines) {
			const entry = this.parseLogLine(line);
			if (entry) {
				entries.push(entry);
			}
		}

		return entries;
	}

	private parseLogLine(line: string): SemanticLogInfo | null {
		// Extract timestamp
		const timestampMatch = line.match(TIMESTAMP_REGEX);
		if (!timestampMatch) return null;
		
		const timestamp = timestampMatch[0];
		const restOfLine = line.slice(timestamp.length).trim();
		
		// Extract label (first word after timestamp)
		const labelMatch = restOfLine.match(/^(\w+)\s+(.*)$/);
		if (!labelMatch) return null;
		
		const [, label, remainder] = labelMatch;
		
		// For now, classify everything as "Other" with basic structure
		return {
			kind: SemanticLogKind.Other,
			timestamp,
			label,
			direction: "none" as const,
			message: remainder,
		};
	}

	generateSummary(entries: SemanticLogInfo[]): TransformedLog['summary'] {
		const semanticBreakdown: Partial<Record<SemanticLogKind, number>> = {};
		let errorCount = 0;
		const warningCount = 0; // Will be implemented later

		for (const entry of entries) {
			semanticBreakdown[entry.kind] = (semanticBreakdown[entry.kind] || 0) + 1;
			
			// Count errors and warnings based on various conditions
			if (entry.kind === SemanticLogKind.IncomingCommand && 'invalid' in entry && entry.invalid) {
				errorCount++;
			}
			if (entry.kind === SemanticLogKind.SendDataResponse && 'success' in entry && !entry.success) {
				errorCount++;
			}
		}

		return {
			totalEntries: entries.length,
			timeRange: {
				start: entries[0]?.timestamp || '',
				end: entries[entries.length - 1]?.timestamp || ''
			},
			semanticBreakdown: semanticBreakdown as Record<SemanticLogKind, number>,
			errorCount,
			warningCount
		};
	}
}
