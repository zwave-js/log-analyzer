import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type {
	Transport,
	TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.d.ts";

/**
 * EventTarget-based MCP transport for browser compatibility.
 *
 * This transport uses EventTarget to enable communication between an MCP client
 * and server running in the same browser context.
 */
export class EventTargetTransport implements Transport {
	private _eventTarget: EventTarget;
	private _isStarted = false;
	private _isClosed = false;

	public sessionId?: string;
	public onclose?: () => void;
	public onerror?: (error: Error) => void;
	public onmessage?: (message: JSONRPCMessage, extra?: any) => void;

	constructor(eventTarget: EventTarget) {
		this._eventTarget = eventTarget;
		this.sessionId = `session-${Math.random().toString(36).substring(7)}`;

		// Listen for messages on the event target
		this._eventTarget.addEventListener(
			"message",
			this._handleMessage.bind(this),
		);
		this._eventTarget.addEventListener(
			"error",
			this._handleError.bind(this),
		);
		this._eventTarget.addEventListener(
			"close",
			this._handleClose.bind(this),
		);
	}

	private _handleMessage(event: Event): void {
		if (!(event instanceof CustomEvent)) return;

		const { message, extra } = event.detail;
		if (this.onmessage) {
			this.onmessage(message, extra);
		}
	}

	private _handleError(event: Event): void {
		if (!(event instanceof CustomEvent)) return;

		const error = event.detail.error;
		if (this.onerror) {
			this.onerror(error);
		}
	}

	private _handleClose(): void {
		this._isClosed = true;
		if (this.onclose) {
			this.onclose();
		}
	}

	async start(): Promise<void> {
		if (this._isStarted) {
			throw new Error("Transport is already started");
		}
		if (this._isClosed) {
			throw new Error("Transport is closed");
		}

		this._isStarted = true;

		// Dispatch a start event to signal the transport is ready
		this._eventTarget.dispatchEvent(
			new CustomEvent("start", {
				detail: { sessionId: this.sessionId },
			}),
		);
	}

	async send(
		message: JSONRPCMessage,
		options?: TransportSendOptions,
	): Promise<void> {
		if (!this._isStarted) {
			throw new Error("Transport not started");
		}
		if (this._isClosed) {
			throw new Error("Transport is closed");
		}

		// Dispatch the message as a custom event
		this._eventTarget.dispatchEvent(
			new CustomEvent("outgoing-message", {
				detail: {
					message,
					options,
					sessionId: this.sessionId,
				},
			}),
		);
	}

	async close(): Promise<void> {
		if (this._isClosed) {
			return;
		}

		this._isClosed = true;
		this._isStarted = false;

		// Clean up event listeners
		this._eventTarget.removeEventListener(
			"message",
			this._handleMessage.bind(this),
		);
		this._eventTarget.removeEventListener(
			"error",
			this._handleError.bind(this),
		);
		this._eventTarget.removeEventListener(
			"close",
			this._handleClose.bind(this),
		);

		// Dispatch close event
		this._eventTarget.dispatchEvent(
			new CustomEvent("close", {
				detail: { sessionId: this.sessionId },
			}),
		);

		if (this.onclose) {
			this.onclose();
		}
	}

	setProtocolVersion?(version: string): void {
		// Store the protocol version if needed
		// For now, we'll just dispatch an event to notify about the version
		this._eventTarget.dispatchEvent(
			new CustomEvent("protocol-version", {
				detail: { version, sessionId: this.sessionId },
			}),
		);
	}
}

/**
 * Creates a pair of EventTarget-based transports for client-server communication.
 *
 * This enables MCP communication within the browser without requiring separate processes.
 */
export function createEventTargetTransportPair(): {
	clientTransport: EventTargetTransport;
	serverTransport: EventTargetTransport;
	bridge: EventTargetTransportBridge;
} {
	const bridge = new EventTargetTransportBridge();
	const clientTransport = new EventTargetTransport(bridge.clientEventTarget);
	const serverTransport = new EventTargetTransport(bridge.serverEventTarget);

	return { clientTransport, serverTransport, bridge };
}

/**
 * Bridge that connects two EventTarget transports to enable bidirectional communication.
 */
class EventTargetTransportBridge {
	public readonly clientEventTarget: EventTarget;
	public readonly serverEventTarget: EventTarget;

	constructor() {
		this.clientEventTarget = new EventTarget();
		this.serverEventTarget = new EventTarget();

		// Bridge outgoing messages from client to server
		this.clientEventTarget.addEventListener("outgoing-message", (event) => {
			if (!(event instanceof CustomEvent)) return;

			const { message } = event.detail;
			this._logMCPMessage("Client → Server", message);

			this.serverEventTarget.dispatchEvent(
				new CustomEvent("message", {
					detail: event.detail,
				}),
			);
		});

		// Bridge outgoing messages from server to client
		this.serverEventTarget.addEventListener("outgoing-message", (event) => {
			if (!(event instanceof CustomEvent)) return;

			const { message } = event.detail;
			this._logMCPMessage("Server → Client", message);

			this.clientEventTarget.dispatchEvent(
				new CustomEvent("message", {
					detail: event.detail,
				}),
			);
		});
	}

	/**
	 * Log MCP messages for debugging tool calls
	 */
	private _logMCPMessage(direction: string, message: any): void {
		if (!message || typeof message !== 'object') return;

		// Log tool calls (requests from client to server)
		if (message.method === 'tools/call') {
			console.log(`🔧 [MCP ${direction}] Tool Call:`, {
				method: message.method,
				toolName: message.params?.name,
				arguments: message.params?.arguments,
				id: message.id
			});
		}
		// Log tool call responses (server to client)
		else if (message.result !== undefined && message.id) {
			// Check if this is a response to a tool call by examining the result structure
			if (message.result?.content || message.result?.isError) {
				console.log(`✅ [MCP ${direction}] Tool Response:`, {
					id: message.id,
					hasContent: !!message.result?.content,
					isError: !!message.result?.isError,
					contentLength: message.result?.content?.length || 0
				});

				// Log first bit of content for debugging
				if (message.result?.content && Array.isArray(message.result.content)) {
					const firstContent = message.result.content[0];
					if (firstContent?.text) {
						const preview = firstContent.text.substring(0, 200);
						console.log(`📝 [MCP ${direction}] Content Preview:`, preview + (firstContent.text.length > 200 ? "..." : ""));
					}
				}
			}
		}
		// Log tool list requests/responses
		else if (message.method === 'tools/list') {
			console.log(`📋 [MCP ${direction}] Tools List Request:`, { id: message.id });
		}
		else if (message.result?.tools) {
			console.log(`📋 [MCP ${direction}] Tools List Response:`, {
				id: message.id,
				toolCount: message.result.tools.length,
				tools: message.result.tools.map((t: any) => t.name)
			});
		}
		// Log errors
		else if (message.error) {
			console.error(`❌ [MCP ${direction}] Error:`, {
				id: message.id,
				error: message.error
			});
		}
		// Log other MCP methods for completeness
		else if (message.method) {
			console.log(`📨 [MCP ${direction}] Method:`, {
				method: message.method,
				id: message.id,
				hasParams: !!message.params
			});
		}
	}

	/**
	 * Cleanup method to remove all event listeners
	 */
	cleanup(): void {
		// The event listeners will be cleaned up when the transports are closed
		// since they handle their own cleanup
	}
}
