import { ChatManager } from '../chat-manager';

describe('ChatManager', () => {
  let chatManager: ChatManager;
  let testProjectPath: string;

  beforeEach(async () => {
    chatManager = new ChatManager();
    await chatManager.initialize();
    testProjectPath = `/tmp/test-project-${Date.now()}`;
  });

  describe('Message Sending', () => {
    it('should send a message and return a message ID', async () => {
      const messageId = await chatManager.sendMessage(
        testProjectPath,
        'Hello, world!'
      );

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe('string');
      expect(messageId.length).toBeGreaterThan(0);
    });

    it('should set correct message type to text by default', async () => {
      await chatManager.sendMessage(testProjectPath, 'Test message');

      const messages = await chatManager.getLastMessages(testProjectPath, 100);
      const userMessage = messages.find((m) => m.sender !== 'System');

      expect(userMessage).toBeDefined();
      expect(userMessage?.type).toBe('text');
    });

    it('should support custom message types', async () => {
      await chatManager.sendMessage(
        testProjectPath,
        'Deploy command',
        'command',
        { env: 'production' }
      );

      const messages = await chatManager.getLastMessages(testProjectPath, 100);
      const commandMessage = messages.find((m) => m.type === 'command');

      expect(commandMessage).toBeDefined();
      expect(commandMessage?.metadata?.env).toBe('production');
    });

    it('should generate unique message IDs', async () => {
      const id1 = await chatManager.sendMessage(testProjectPath, 'Message 1');
      const id2 = await chatManager.sendMessage(testProjectPath, 'Message 2');

      expect(id1).not.toBe(id2);
    });
  });

  describe('Message Retrieval', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await chatManager.sendMessage(testProjectPath, `Message ${i}`);
      }
    });

    it('should retrieve last N messages', async () => {
      const messages = await chatManager.getLastMessages(testProjectPath, 2);
      expect(messages.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for non-existent chat room', async () => {
      const messages = await chatManager.getLastMessages('/non/existent/path', 10);
      expect(messages).toEqual([]);
    });
  });

  describe('Message Filtering', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await chatManager.sendMessage(testProjectPath, `Message ${i}`);
      }
    });

    it('should filter messages by sinceTimestamp', async () => {
      const messages = await chatManager.getLastMessages(testProjectPath, 100);
      const middleMessage = messages[Math.floor(messages.length / 2)];

      const filtered = await chatManager.getFilteredMessages(testProjectPath, {
        sinceTimestamp: middleMessage.timestamp.toISOString(),
      });

      expect(filtered.length).toBeGreaterThan(0);
    });

    it('should filter messages by lastSeconds', async () => {
      const filtered = await chatManager.getFilteredMessages(testProjectPath, {
        lastSeconds: 1,
      });
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe('Message Searching', () => {
    beforeEach(async () => {
      await chatManager.sendMessage(testProjectPath, 'This is a test message.');
      await chatManager.sendMessage(testProjectPath, 'Another TEST message.');
      await chatManager.sendMessage(testProjectPath, 'Completely different.');
    });

    it('should return messages matching a simple query', async () => {
      const results = await chatManager.searchMessages(testProjectPath, 'test');
      expect(results.length).toBe(2);
      expect(results[0].content).toBe('This is a test message.');
      expect(results[1].content).toBe('Another TEST message.');
    });

    it('should be case-insensitive', async () => {
      const results = await chatManager.searchMessages(testProjectPath, 'TEST');
      expect(results.length).toBe(2);
      expect(results[0].content).toBe('This is a test message.');
      expect(results[1].content).toBe('Another TEST message.');
    });

    it('should return an empty array if no messages match', async () => {
      const results = await chatManager.searchMessages(testProjectPath, 'nomatch');
      expect(results.length).toBe(0);
    });
  });

  describe('Agent Identity', () => {
    it('should have a name after initialization', () => {
      const name = chatManager.getMyName();
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });
  });

  describe('Multi-Project Isolation', () => {
    it('should maintain separate chat histories for different projects', async () => {
      const projectPathA = `/tmp/test-project-a-${Date.now()}-1`;
      const projectPathB = `/tmp/test-project-b-${Date.now()}-1`;

      // Send messages to Project A
      await chatManager.sendMessage(projectPathA, 'Project A message 1');
      await chatManager.sendMessage(projectPathA, 'Project A message 2');

      // Send messages to Project B
      await chatManager.sendMessage(projectPathB, 'Project B message 1');
      await chatManager.sendMessage(projectPathB, 'Project B message 2');

      // Verify Project A has only its messages
      const messagesA = await chatManager.getLastMessages(projectPathA, 100);
      const contentA = messagesA
        .filter((m) => m.sender !== 'System')
        .map((m) => m.content);

      expect(contentA).toContain('Project A message 1');
      expect(contentA).toContain('Project A message 2');
      expect(contentA).not.toContain('Project B message 1');
      expect(contentA).not.toContain('Project B message 2');

      // Verify Project B has only its messages
      const messagesB = await chatManager.getLastMessages(projectPathB, 100);
      const contentB = messagesB
        .filter((m) => m.sender !== 'System')
        .map((m) => m.content);

      expect(contentB).toContain('Project B message 1');
      expect(contentB).toContain('Project B message 2');
      expect(contentB).not.toContain('Project A message 1');
      expect(contentB).not.toContain('Project A message 2');
    });

    it('should isolate filtering results between projects', async () => {
      const now = new Date();
      const projectPath1 = `/tmp/filter-test-1-${Date.now()}`;
      const projectPath2 = `/tmp/filter-test-2-${Date.now()}`;

      // Send messages to both projects with delays
      await chatManager.sendMessage(projectPath1, 'Message 1 in project 1');
      await chatManager.sendMessage(projectPath2, 'Message 1 in project 2');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      await chatManager.sendMessage(projectPath1, 'Message 2 in project 1');
      await chatManager.sendMessage(projectPath2, 'Message 2 in project 2');

      // Filter messages from project 1 (last 2 seconds)
      const filtered1 = await chatManager.getFilteredMessages(projectPath1, {
        lastSeconds: 2,
      });
      const content1 = filtered1
        .filter((m) => m.sender !== 'System')
        .map((m) => m.content);

      // Filter messages from project 2 (last 2 seconds)
      const filtered2 = await chatManager.getFilteredMessages(projectPath2, {
        lastSeconds: 2,
      });
      const content2 = filtered2
        .filter((m) => m.sender !== 'System')
        .map((m) => m.content);

      // Verify isolation
      expect(content1).toContain('Message 1 in project 1');
      expect(content1).toContain('Message 2 in project 1');
      expect(content1).not.toContain('Message 1 in project 2');
      expect(content1).not.toContain('Message 2 in project 2');

      expect(content2).toContain('Message 1 in project 2');
      expect(content2).toContain('Message 2 in project 2');
      expect(content2).not.toContain('Message 1 in project 1');
      expect(content2).not.toContain('Message 2 in project 1');
    });

    it('should support three or more simultaneous independent projects', async () => {
      const projectPathA = `/tmp/test-project-a-${Date.now()}-3`;
      const projectPathB = `/tmp/test-project-b-${Date.now()}-3`;
      const projectPathC = `/tmp/test-project-c-${Date.now()}-3`;

      // Send to all three projects
      await chatManager.sendMessage(projectPathA, 'A-1');
      await chatManager.sendMessage(projectPathB, 'B-1');
      await chatManager.sendMessage(projectPathC, 'C-1');

      await chatManager.sendMessage(projectPathA, 'A-2');
      await chatManager.sendMessage(projectPathB, 'B-2');
      await chatManager.sendMessage(projectPathC, 'C-2');

      // Verify each project only has its own messages
      const [messagesA, messagesB, messagesC] = await Promise.all([
        chatManager.getLastMessages(projectPathA, 100),
        chatManager.getLastMessages(projectPathB, 100),
        chatManager.getLastMessages(projectPathC, 100),
      ]);

      const textA = messagesA
        .filter((m) => m.type === 'text')
        .map((m) => m.content);
      const textB = messagesB
        .filter((m) => m.type === 'text')
        .map((m) => m.content);
      const textC = messagesC
        .filter((m) => m.type === 'text')
        .map((m) => m.content);

      // Project A should only have A messages
      expect(textA).toEqual(['A-1', 'A-2']);
      expect(textA.length).toBe(2);

      // Project B should only have B messages
      expect(textB).toEqual(['B-1', 'B-2']);
      expect(textB.length).toBe(2);

      // Project C should only have C messages
      expect(textC).toEqual(['C-1', 'C-2']);
      expect(textC.length).toBe(2);
    });

    it('should allow agent to query different projects without interference', async () => {
      const projectX = `/tmp/agent-multi-x-${Date.now()}`;
      const projectY = `/tmp/agent-multi-y-${Date.now()}`;

      // Same agent sends to multiple projects
      await chatManager.sendMessage(projectX, 'Agent in project X');
      await chatManager.sendMessage(projectY, 'Agent in project Y');
      await chatManager.sendMessage(projectX, 'Another message in X');

      // Query both projects
      const xMessages = await chatManager.getLastMessages(projectX, 100);
      const yMessages = await chatManager.getLastMessages(projectY, 100);

      // Verify no cross-contamination
      expect(xMessages.length).toBeLessThanOrEqual(4); // 2 user + 1 system (creation) + 1 system (welcome)
      expect(yMessages.length).toBeLessThanOrEqual(3); // 1 user + 1 system (creation) + 1 system (welcome)

      const xContent = xMessages
        .filter((m) => m.sender !== 'System')
        .map((m) => m.content);
      const yContent = yMessages
        .filter((m) => m.sender !== 'System')
        .map((m) => m.content);

      expect(xContent).toContain('Agent in project X');
      expect(xContent).toContain('Another message in X');
      expect(xContent).not.toContain('Agent in project Y');

      expect(yContent).toContain('Agent in project Y');
      expect(yContent).not.toContain('Agent in project X');
      expect(yContent).not.toContain('Another message in X');
    });
  });
});
