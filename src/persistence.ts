/**
 * Persistence layer for saving/loading chat rooms to/from JSON files
 * Uses file locking to prevent race conditions in multi-instance scenarios
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as lockfile from 'proper-lockfile';
import * as zlib from 'zlib';
import { ChatRoom, Message, AgentIdentity } from './types.js';
import { AgentNamer } from './agent-namer.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const IDENTITY_DIR = path.join(process.cwd(), '.mcp-identities');
// Each MCP server instance gets a unique identity file based on PID and start time
// This prevents multiple instances from sharing the same identity
const IDENTITY_FILE = path.join(IDENTITY_DIR, `.agent-identity-${process.pid}-${Date.now()}.json`);

// Lock options for proper-lockfile
const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 100,
    maxTimeout: 2000,
  },
  stale: 10000, // Lock expires after 10 seconds
};

/**
 * Serializable chat room data
 */
interface SerializableChatRoom {
  projectPath: string;
  messages: Array<{
    id: string;
    sender: string;
    content: string;
    timestamp: string;
    type: 'text' | 'system' | 'command' | 'notification';
    metadata?: Record<string, unknown>;
  }>;
  createdAt: string;
  lastSeen?: { [agentName: string]: string };
}

/**
 * Manages persistence of chat rooms to JSON files
 */
export class PersistenceManager {
  /**
   * Ensures the data directory exists
   */
  async ensureDataDirectory(): Promise<void> {
    try {
      await fs.access(DATA_DIR);
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Converts a project path to a safe filename
   * @param projectPath The project path
   * @returns A safe filename
   */
  private pathToFilename(projectPath: string): string {
    // Use a SHA256 hash to prevent filename collisions and handle long paths
    const hash = crypto.createHash('sha256');
    hash.update(projectPath);
    return `${hash.digest('hex')}.json.gz`;
  }

  /**
   * Gets the file path for a project's chat room
   * @param projectPath The project path
   * @returns The full file path
   */
  private getFilePath(projectPath: string): string {
    const filename = this.pathToFilename(projectPath);
    return path.join(DATA_DIR, filename);
  }

  /**
   * Saves a chat room to disk
   * @param chatRoom The chat room to save
   */
  async saveChatRoom(chatRoom: ChatRoom): Promise<void> {
    await this.ensureDataDirectory();

    const lastSeenSerialized: { [agentName: string]: string } = {};
    for (const agentName in chatRoom.lastSeen) {
      lastSeenSerialized[agentName] = chatRoom.lastSeen[agentName].toISOString();
    }

    const serializable: SerializableChatRoom = {
      projectPath: chatRoom.projectPath,
      messages: chatRoom.messages.map((msg) => ({
        id: msg.id,
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        type: msg.type,
        metadata: msg.metadata,
      })),
      createdAt: chatRoom.createdAt.toISOString(),
      lastSeen: lastSeenSerialized,
    };

    const filePath = this.getFilePath(chatRoom.projectPath);
    const json = JSON.stringify(serializable, null, 2);

    const compressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(json, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    await fs.writeFile(filePath, compressed);
  }

  /**
   * Loads a chat room from disk
   * @param projectPath The project path
   * @returns The loaded chat room or null if not found
   */
  async loadChatRoom(projectPath: string): Promise<ChatRoom | null> {
    const filePath = this.getFilePath(projectPath);

    try {
      const compressed = await fs.readFile(filePath);
      const json = await new Promise<string>((resolve, reject) => {
        zlib.gunzip(compressed, (err, result) => {
          if (err) return reject(err);
          resolve(result.toString('utf-8'));
        });
      });
      const data: SerializableChatRoom = JSON.parse(json);

      const chatRoom: ChatRoom = {
        projectPath: data.projectPath,
        messages: data.messages.map((msg) => ({
          id: msg.id,
          sender: msg.sender,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          type: msg.type,
          metadata: msg.metadata,
        })),
        createdAt: new Date(data.createdAt),
        lastSeen: {},
      };

      if (data.lastSeen) {
        for (const agentName in data.lastSeen) {
          chatRoom.lastSeen[agentName] = new Date(data.lastSeen[agentName]);
        }
      }

      return chatRoom;
    } catch (error) {
      // File doesn't exist or is invalid
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Atomically updates a chat room with file locking
   * Prevents race conditions when multiple instances modify the same chat
   * @param projectPath The project path
   * @param updateFn Function that modifies the chat room
   * @returns The updated chat room
   */
  async atomicUpdateChatRoom(
    projectPath: string,
    updateFn: (chatRoom: ChatRoom) => void | Promise<void>
  ): Promise<ChatRoom> {
    await this.ensureDataDirectory();
    const filePath = this.getFilePath(projectPath);

    // Ensure file exists before locking (lockfile needs the file to exist)
    try {
      await fs.access(filePath);
    } catch {
      // Create empty chat room file
      const emptyChatRoom: ChatRoom = {
        projectPath,
        messages: [],
        createdAt: new Date(),
        lastSeen: {},
      };
      await this.saveChatRoom(emptyChatRoom);
    }

    // Acquire lock on the file
    let release: (() => Promise<void>) | null = null;
    try {
      release = await lockfile.lock(filePath, LOCK_OPTIONS);

      // Load current state
      const chatRoom = await this.loadChatRoom(projectPath);
      if (!chatRoom) {
        throw new Error('Chat room disappeared during lock acquisition');
      }

      // Apply update function
      await updateFn(chatRoom);

      // Save back to disk
      await this.saveChatRoom(chatRoom);

      return chatRoom;
    } finally {
      // Always release the lock
      if (release) {
        await release();
      }
    }
  }

  /**
   * Gets all currently used names from existing identity files
   * @returns Set of names currently in use by other instances
   */
  private async getUsedNamesFromIdentityFiles(): Promise<Set<string>> {
    const usedNames = new Set<string>();

    try {
      await this.ensureIdentityDirectory();
      const files = await fs.readdir(IDENTITY_DIR);

      for (const file of files) {
        if (file.startsWith('.agent-identity-') && file.endsWith('.json')) {
          const filePath = path.join(IDENTITY_DIR, file);
          try {
            const json = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(json);
            if (data.name) {
              usedNames.add(data.name);
            }
          } catch {
            // Skip invalid or unreadable files
          }
        }
      }
    } catch {
      // Directory doesn't exist yet, no names in use
    }

    return usedNames;
  }

  /**
   * Loads or creates agent identity for this MCP server instance
   * @param namer The agent namer to use for creating new identities
   * @returns The agent identity
   */
  async loadOrCreateIdentity(namer: AgentNamer): Promise<AgentIdentity> {
    try {
      const json = await fs.readFile(IDENTITY_FILE, 'utf-8');
      const data = JSON.parse(json);
      return {
        name: data.name,
        createdAt: new Date(data.createdAt),
      };
    } catch (error) {
      // File doesn't exist, create new identity
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Get all currently used names and register them with the namer
        const usedNames = await this.getUsedNamesFromIdentityFiles();
        for (const name of usedNames) {
          await namer.registerUsedName(name);
        }

        const identity: AgentIdentity = {
          name: await namer.assignName(),
          createdAt: new Date(),
        };
        await this.saveIdentity(identity);
        return identity;
      }
      throw error;
    }
  }

  /**
   * Ensures the identity directory exists
   */
  private async ensureIdentityDirectory(): Promise<void> {
    try {
      await fs.access(IDENTITY_DIR);
    } catch {
      await fs.mkdir(IDENTITY_DIR, { recursive: true });
    }
  }

  /**
   * Saves agent identity to disk
   * @param identity The agent identity
   */
  private async saveIdentity(identity: AgentIdentity): Promise<void> {
    await this.ensureIdentityDirectory();
    const serializable = {
      name: identity.name,
      createdAt: identity.createdAt.toISOString(),
    };
    const json = JSON.stringify(serializable, null, 2);
    await fs.writeFile(IDENTITY_FILE, json, 'utf-8');
  }

  /**
   * Lists all saved chat room files
   * @returns Array of project paths that have saved data
   */
  async listSavedChatRooms(): Promise<string[]> {
    try {
      await this.ensureDataDirectory();
      const files = await fs.readdir(DATA_DIR);

      const projectPaths: string[] = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(DATA_DIR, file);
          try {
            const json = await fs.readFile(filePath, 'utf-8');
            const data: SerializableChatRoom = JSON.parse(json);
            projectPaths.push(data.projectPath);
          } catch {
            // Skip invalid files
          }
        }
      }

      return projectPaths;
    } catch {
      return [];
    }
  }

  /**
   * Deletes a chat room file from disk
   * @param projectPath The project path
   */
  async deleteChatRoom(projectPath: string): Promise<void> {
    const filePath = this.getFilePath(projectPath);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
