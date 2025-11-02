/**
 * Type definitions for the MCP Agent Messaging Server
 */

/**
 * Configuration constants for message retention and pruning
 */
export const MESSAGE_RETENTION_CONFIG = {
  /** Default number of messages to keep per chat room */
  DEFAULT_LIMIT: 1000,
  /** Minimum allowed retention limit */
  MIN_LIMIT: 100,
  /** Maximum allowed retention limit */
  MAX_LIMIT: 50000,
  /** Environment variable name for configuring retention */
  ENV_VAR_NAME: 'MCP_MESSAGE_RETENTION_LIMIT',
};

/**
 * Represents a single message in a chat
 */
export interface Message {
  /** Unique message ID (uuid) */
  id: string;
  /** Name of the agent who sent the message */
  sender: string;
  /** Message content */
  content: string;
  /** Timestamp when the message was sent */
  timestamp: Date;
  /** Message type: 'text', 'system', 'command', or 'notification' */
  type: 'text' | 'system' | 'command' | 'notification';
  /** Optional metadata for the message (e.g., command parameters, notification level) */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a chat room for a project
 */
export interface ChatRoom {
  /** Project path/folder identifier */
  projectPath: string;
  /** Message history for this chat room */
  messages: Message[];
  /** When the chat room was created */
  createdAt: Date;
  /** Dictionary of agent names to their last seen timestamp */
  lastSeen: { [agentName: string]: Date };
}

/**
 * Agent identity (stored per MCP server instance)
 */
export interface AgentIdentity {
  /** Assigned German name */
  name: string;
  /** When this identity was created */
  createdAt: Date;
}
