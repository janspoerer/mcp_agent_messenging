/**
 * Chat room management system
 * Redesigned for MCP multi-instance architecture
 */

import { randomUUID } from 'crypto';
import { ChatRoom, Message, AgentIdentity } from './types.js';
import { AgentNamer } from './agent-namer.js';
import { PersistenceManager } from './persistence.js';

/**
 * Message retention limit - configurable via environment variable
 * Default: 1000 messages per chat room
 * Min: 100, Max: 50000
 *
 * Environment variable: MCP_MESSAGE_RETENTION_LIMIT
 * Example: MCP_MESSAGE_RETENTION_LIMIT=5000
 */
function getMessageRetentionLimit(): number {
  const envLimit = process.env.MCP_MESSAGE_RETENTION_LIMIT;

  if (!envLimit) {
    return 1000; // Default
  }

  const limit = parseInt(envLimit, 10);

  if (isNaN(limit)) {
    console.warn(`Invalid MCP_MESSAGE_RETENTION_LIMIT: "${envLimit}". Using default of 1000.`);
    return 1000;
  }

  // Validate range
  if (limit < 100) {
    console.warn(`MCP_MESSAGE_RETENTION_LIMIT too low: ${limit}. Using minimum of 100.`);
    return 100;
  }

  if (limit > 50000) {
    console.warn(`MCP_MESSAGE_RETENTION_LIMIT too high: ${limit}. Using maximum of 50000.`);
    return 50000;
  }

  return limit;
}

const MAX_MESSAGES = getMessageRetentionLimit();

/**
 * Manages chat rooms for a single agent instance
 * Each MCP server instance represents one agent
 */
export class ChatManager {
  private persistence: PersistenceManager = new PersistenceManager();
  private agentNamer: AgentNamer = new AgentNamer();
  private myIdentity: AgentIdentity | null = null;

  /**
   * Initializes the chat manager and loads/creates agent identity
   */
  async initialize(): Promise<void> {
    this.myIdentity = await this.persistence.loadOrCreateIdentity(this.agentNamer);
  }

  /**
   * Gets this agent's name
   * @returns The agent name
   */
  getMyName(): string {
    if (!this.myIdentity) {
      throw new Error('ChatManager not initialized');
    }
    return this.myIdentity.name;
  }



  /**
   * Sends a message to a project chat
   * Uses atomic file locking to prevent race conditions
   * @param projectPath The project path
   * @param content The message content
   * @param type The message type (default: 'text')
   * @param metadata Optional metadata for the message
   */
  async sendMessage(
    projectPath: string,
    content: string,
    type: 'text' | 'system' | 'command' | 'notification' = 'text',
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.myIdentity) {
      throw new Error('ChatManager not initialized');
    }

    const myName = this.myIdentity.name;
    let messageId = '';

    // Use atomic update to prevent race conditions
    await this.persistence.atomicUpdateChatRoom(projectPath, async (chatRoom) => {
      // Check if this is a newly created chat room
      const isNewRoom = chatRoom.messages.length === 0;

      if (isNewRoom) {
        // Add system message about creation
        chatRoom.messages.push({
          id: randomUUID(),
          sender: 'System',
          content: `Chat room created by ${myName}`,
          timestamp: new Date(),
          type: 'system',
        });
      }

      // Add the message
      messageId = randomUUID();
      const message: Message = {
        id: messageId,
        sender: myName,
        content,
        timestamp: new Date(),
        type,
        metadata,
      };
      chatRoom.messages.push(message);
      chatRoom.lastSeen[myName] = new Date();

      // Prune old messages if history is too long
      if (chatRoom.messages.length > MAX_MESSAGES) {
        const messagesToKeep = chatRoom.messages.slice(
          chatRoom.messages.length - MAX_MESSAGES
        );
        chatRoom.messages = messagesToKeep;
      }
    });

    return messageId;
  }

  /**
   * Updates the last seen timestamp for the current agent
   * @param projectPath The project path
   */
  async heartbeat(projectPath: string): Promise<void> {
    if (!this.myIdentity) {
      throw new Error('ChatManager not initialized');
    }

    const myName = this.myIdentity.name;

    await this.persistence.atomicUpdateChatRoom(projectPath, async (chatRoom) => {
      chatRoom.lastSeen[myName] = new Date();
    });
  }

  /**
   * Gets the last N messages from a project chat
   * Always reloads from disk to get latest messages from other agents
   * @param projectPath The project path
   * @param count Number of messages to retrieve
   * @returns Array of messages
   */
  async getLastMessages(projectPath: string, count: number): Promise<Message[]> {
    // Always reload from disk
    const chatRoom = await this.persistence.loadChatRoom(projectPath);

    if (!chatRoom) {
      return [];
    }

    const startIndex = Math.max(0, chatRoom.messages.length - count);
    return chatRoom.messages.slice(startIndex);
  }

  /**
   * Gets messages with advanced filtering options
   * @param projectPath The project path
   * @param options Filtering options
   * @returns Filtered array of messages
   */
  async getFilteredMessages(
    projectPath: string,
    options: {
      count?: number;
      sinceTimestamp?: string;
      lastSeconds?: number;
    }
  ): Promise<Message[]> {
    // Always reload from disk
    const chatRoom = await this.persistence.loadChatRoom(projectPath);

    if (!chatRoom) {
      return [];
    }

    let filtered = [...chatRoom.messages];

    // Filter by timestamp if provided
    if (options.sinceTimestamp) {
      const sinceDate = new Date(options.sinceTimestamp);
      filtered = filtered.filter((msg) => msg.timestamp >= sinceDate);
    }

    // Filter by last N seconds if provided
    if (options.lastSeconds !== undefined) {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - options.lastSeconds * 1000);
      filtered = filtered.filter((msg) => msg.timestamp >= cutoffTime);
    }

    // Apply count limit if provided
    if (options.count !== undefined) {
      const startIndex = Math.max(0, filtered.length - options.count);
      filtered = filtered.slice(startIndex);
    }

    return filtered;
  }

  /**
   * Searches messages in a project chat
   * @param projectPath The project path
   * @param query The search query
   * @returns Array of messages that match the query
   */
  async searchMessages(projectPath: string, query: string): Promise<Message[]> {
    const chatRoom = await this.persistence.loadChatRoom(projectPath);

    if (!chatRoom) {
      return [];
    }

    const lowerCaseQuery = query.toLowerCase();

    return chatRoom.messages.filter((msg) =>
      msg.content.toLowerCase().includes(lowerCaseQuery)
    );
  }

  /**
   * Gets all unique agent names from recent messages in a project
   * Derives active agents from message history
   * @param projectPath The project path
   * @param recentMessageCount How many recent messages to look at (default: 50)
   * @returns Array of agent names
   */
  async getAgentNames(projectPath: string): Promise<string[]> {
    // Always reload from disk
    const chatRoom = await this.persistence.loadChatRoom(projectPath);
    const myName = this.getMyName();

    if (!chatRoom) {
      return [myName];
    }

    const activeAgents = new Set<string>();
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    for (const agentName in chatRoom.lastSeen) {
      if (chatRoom.lastSeen[agentName] > fiveMinutesAgo) {
        activeAgents.add(agentName);
      }
    }

    // Always include yourself
    activeAgents.add(myName);

    return Array.from(activeAgents).sort();
  }

  /**
   * Gets statistics about chat rooms
   * @returns Statistics object
   */
  async getStats(): Promise<{
    myName: string;
    totalChatRooms: number;
  }> {
    const chatRooms = await this.persistence.listSavedChatRooms();

    return {
      myName: this.getMyName(),
      totalChatRooms: chatRooms.length,
    };
  }
}
