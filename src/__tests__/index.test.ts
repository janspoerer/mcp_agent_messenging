import { jest } from '@jest/globals';
import { AgentMessagingServer } from '../index';
import { ChatManager } from '../chat-manager';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types';

jest.mock('../chat-manager');
jest.mock('@modelcontextprotocol/sdk/server/stdio');

describe('AgentMessagingServer', () => {
  let server: AgentMessagingServer;
  let chatManager: jest.Mocked<ChatManager>;

  beforeEach(() => {
    server = new AgentMessagingServer();
    chatManager = new (ChatManager as jest.Mock<ChatManager>)() as jest.Mocked<ChatManager>;
    chatManager.searchMessages = jest.fn();
    chatManager.getMyName = jest.fn().mockReturnValue('test-agent');
    (server as any).chatManager = chatManager;
  });

  it('should handle search_messages tool calls', async () => {
    const projectPath = '/test/project';
    const query = 'test';
    const messages = [
      {
        id: '1',
        sender: 'test-agent',
        content: 'This is a test message',
        timestamp: new Date(),
        type: 'text' as const,
      },
    ];

    chatManager.searchMessages.mockResolvedValue(messages);

    const request = {
      type: 'call_tool',
      params: {
        name: 'search_messages',
        arguments: {
          project_path: projectPath,
          query,
        },
      },
    };

    const handler = (server as any).server.getRequestHandler(CallToolRequestSchema);
    const result = await handler(request);

    expect(chatManager.searchMessages).toHaveBeenCalledWith(projectPath, query);
    expect(result.content[0].text).toContain('Messages found: 1');
    expect(result.content[0].text).toContain('This is a test message');
  });
});
