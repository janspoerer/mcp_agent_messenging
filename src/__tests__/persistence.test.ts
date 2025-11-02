/**
 * Unit tests for PersistenceManager
 */

import { PersistenceManager } from '../persistence';
import { ChatRoom, Message, AgentIdentity } from '../types';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as lockfile from 'proper-lockfile';
import * as zlib from 'zlib';
import * as crypto from 'crypto';

// Mock external dependencies
jest.mock('fs/promises');
jest.mock('proper-lockfile');
jest.mock('zlib');
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('hashed_project_path'),
  }),
}));

describe('PersistenceManager', () => {
  let persistenceManager: PersistenceManager;
  const mockProjectPath = '/test/project';
  const mockFilePath = path.join(process.cwd(), 'data', 'hashed_project_path.json.gz');
  const mockIdentityFilePath = `/path/to/.mcp-identities/.agent-identity-${process.pid}-${Date.now()}.json`;

  beforeEach(() => {
    jest.clearAllMocks();
    persistenceManager = new PersistenceManager();

    // Mock ensureDataDirectory and ensureIdentityDirectory to do nothing
    jest.spyOn(persistenceManager, 'ensureDataDirectory').mockResolvedValue(undefined);
    jest.spyOn(persistenceManager, 'ensureIdentityDirectory' as any).mockResolvedValue(undefined);

    // Mock zlib for compression/decompression
    jest.spyOn(zlib, 'gzip' as any).mockImplementation((data: any, callback: any) => callback(null, Buffer.from(data.toString() + '_compressed')));
    jest.spyOn(zlib, 'gunzip' as any).mockImplementation((data: any, callback: any) => callback(null, Buffer.from(data.toString().replace('_compressed', ''))));

    // Mock fs.access to simulate file existence
    (fs.access as jest.Mock).mockResolvedValue(undefined); // File exists by default
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('{}')); // Default empty content
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);

    // Mock lockfile
    (lockfile.lock as jest.Mock).mockResolvedValue(jest.fn().mockResolvedValue(undefined));
  });

  describe('pathToFilename', () => {
    test('should generate a consistent SHA256 hash for a project path', () => {
      const hashSpy = jest.spyOn(crypto, 'createHash');
      const filename = (persistenceManager as any).pathToFilename(mockProjectPath);
      expect(hashSpy).toHaveBeenCalledWith('sha256');
      expect(filename).toBe('hashed_project_path.json.gz');
    });

    test('should handle different project paths', () => {
      const differentProjectPath = '/another/project';
      (crypto.createHash as jest.Mock).mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('another_hashed_path'),
      });
      const filename = (persistenceManager as any).pathToFilename(differentProjectPath);
      expect(filename).toBe('another_hashed_path.json.gz');
    });
  });

  describe('saveChatRoom and loadChatRoom', () => {
    const mockChatRoom: ChatRoom = {
      projectPath: mockProjectPath,
      messages: [
        {
          id: 'msg1',
          sender: 'AgentA',
          content: 'Hello',
          timestamp: new Date(),
          type: 'text',
          metadata: { key: 'value' },
        },
      ],
      createdAt: new Date(),
      lastSeen: {
        AgentA: new Date(),
      },
    };

    test('should save a chat room and load it back with data integrity', async () => {
      const writeFileSpy = jest.spyOn(fs, 'writeFile');
      const readFileSpy = jest.spyOn(fs, 'readFile');

      // Simulate saving
      await persistenceManager.saveChatRoom(mockChatRoom);

      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      const writtenContent = writeFileSpy.mock.calls[0][1].toString();
      expect(writtenContent).toContain('_compressed'); // Verify compression mock

      // Simulate loading
      readFileSpy.mockResolvedValue(Buffer.from(writtenContent));
      const loadedChatRoom = await persistenceManager.loadChatRoom(mockProjectPath);

      expect(loadedChatRoom).toEqual(expect.objectContaining({
        projectPath: mockChatRoom.projectPath,
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: mockChatRoom.messages[0].id,
            sender: mockChatRoom.messages[0].sender,
            content: mockChatRoom.messages[0].content,
            type: mockChatRoom.messages[0].type,
            metadata: mockChatRoom.messages[0].metadata,
          }),
        ]),
        createdAt: expect.any(Date),
        lastSeen: expect.objectContaining({
          AgentA: expect.any(Date),
        }),
      }));
      expect(loadedChatRoom?.messages[0].timestamp.toISOString()).toBe(mockChatRoom.messages[0].timestamp.toISOString());
      expect(loadedChatRoom?.createdAt.toISOString()).toBe(mockChatRoom.createdAt.toISOString());
      expect(loadedChatRoom?.lastSeen?.AgentA.toISOString()).toBe(mockChatRoom.lastSeen?.AgentA.toISOString());
    });

    test('should return null when loading a non-existent chat room', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }));
      const loadedChatRoom = await persistenceManager.loadChatRoom('/nonexistent/project');
      expect(loadedChatRoom).toBeNull();
    });

    test('should throw error for other file read errors', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      await expect(persistenceManager.loadChatRoom(mockProjectPath)).rejects.toThrow('Permission denied');
    });
  });

  describe('atomicUpdateChatRoom', () => {
    const initialChatRoom: ChatRoom = {
      projectPath: mockProjectPath,
      messages: [],
      createdAt: new Date(),
      lastSeen: {},
    };

    test('should perform a basic update with file locking', async () => {
      const loadChatRoomSpy = jest.spyOn(persistenceManager, 'loadChatRoom').mockResolvedValue(initialChatRoom);
      const saveChatRoomSpy = jest.spyOn(persistenceManager, 'saveChatRoom').mockResolvedValue(undefined);
      const lockSpy = jest.spyOn(lockfile, 'lock');
      const releaseSpy = jest.fn().mockResolvedValue(undefined);
      (lockfile.lock as jest.Mock).mockResolvedValue(releaseSpy);

      const updateFn = (chatRoom: ChatRoom) => {
        chatRoom.messages.push({
          id: 'newMsg',
          sender: 'Updater',
          content: 'Updated message',
          timestamp: new Date(),
          type: 'text',
        });
      };

      const updatedChatRoom = await persistenceManager.atomicUpdateChatRoom(mockProjectPath, updateFn);

      expect(lockSpy).toHaveBeenCalledWith(mockFilePath, expect.any(Object));
      expect(loadChatRoomSpy).toHaveBeenCalledWith(mockProjectPath);
      expect(saveChatRoomSpy).toHaveBeenCalledTimes(1);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
      expect(updatedChatRoom.messages).toHaveLength(1);
      expect(updatedChatRoom.messages[0].content).toBe('Updated message');
    });

    test('should create an empty chat room file if it does not exist before locking', async () => {
      (fs.access as jest.Mock).mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' })); // Simulate file not existing
      const saveChatRoomSpy = jest.spyOn(persistenceManager, 'saveChatRoom').mockResolvedValue(undefined);
      const loadChatRoomSpy = jest.spyOn(persistenceManager, 'loadChatRoom').mockResolvedValue(initialChatRoom);
      const lockSpy = jest.spyOn(lockfile, 'lock');
      const releaseSpy = jest.fn().mockResolvedValue(undefined);
      (lockfile.lock as jest.Mock).mockResolvedValue(releaseSpy);

      const updateFn = (chatRoom: ChatRoom) => {
        chatRoom.messages.push({
          id: 'newMsg',
          sender: 'Updater',
          content: 'Updated message',
          timestamp: new Date(),
          type: 'text',
        });
      };

      await persistenceManager.atomicUpdateChatRoom(mockProjectPath, updateFn);

      expect(saveChatRoomSpy).toHaveBeenCalledTimes(2); // Once to create empty, once to save updated
      expect(lockSpy).toHaveBeenCalledWith(mockFilePath, expect.any(Object));
      expect(loadChatRoomSpy).toHaveBeenCalledWith(mockProjectPath);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
    });

    test('should throw an error if chat room disappears during lock acquisition', async () => {
      const loadChatRoomSpy = jest.spyOn(persistenceManager, 'loadChatRoom').mockResolvedValue(null); // Simulate disappearance
      const lockSpy = jest.spyOn(lockfile, 'lock');
      const releaseSpy = jest.fn().mockResolvedValue(undefined);
      (lockfile.lock as jest.Mock).mockResolvedValue(releaseSpy);

      const updateFn = (chatRoom: ChatRoom) => { /* no-op */ };

      await expect(persistenceManager.atomicUpdateChatRoom(mockProjectPath, updateFn)).rejects.toThrow('Chat room disappeared during lock acquisition');
      expect(lockSpy).toHaveBeenCalledWith(mockFilePath, expect.any(Object));
      expect(releaseSpy).toHaveBeenCalledTimes(1); // Lock should still be released
    });

    test('should release lock even if updateFn throws an error', async () => {
      const loadChatRoomSpy = jest.spyOn(persistenceManager, 'loadChatRoom').mockResolvedValue(initialChatRoom);
      const saveChatRoomSpy = jest.spyOn(persistenceManager, 'saveChatRoom').mockResolvedValue(undefined);
      const lockSpy = jest.spyOn(lockfile, 'lock');
      const releaseSpy = jest.fn().mockResolvedValue(undefined);
      (lockfile.lock as jest.Mock).mockResolvedValue(releaseSpy);

      const updateFn = (chatRoom: ChatRoom) => {
        throw new Error('Update failed');
      };

      await expect(persistenceManager.atomicUpdateChatRoom(mockProjectPath, updateFn)).rejects.toThrow('Update failed');
      expect(lockSpy).toHaveBeenCalledWith(mockFilePath, expect.any(Object));
      expect(loadChatRoomSpy).toHaveBeenCalledWith(mockProjectPath);
      expect(saveChatRoomSpy).not.toHaveBeenCalled(); // Should not save if update fails
      expect(releaseSpy).toHaveBeenCalledTimes(1); // Lock should still be released
    });
  });
});
