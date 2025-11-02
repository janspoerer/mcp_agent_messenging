#!/usr/bin/env node

/**
 * MCP Agent Messaging Server
 * Allows agents to communicate with each other in project-based chat rooms
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ChatManager } from './chat-manager.js';

/**
 * MCP Server for Agent Messaging
 */
export class AgentMessagingServer {
  private server: Server;
  private chatManager: ChatManager;

  constructor() {
    this.chatManager = new ChatManager();

    this.server = new Server(
      {
        name: 'agent-messaging-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Log errors
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Sets up the MCP tool handlers
   */
  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Get project path from arguments or use current working directory
        const projectPath = (args as any).project_path || process.cwd();

        switch (name) {
          case 'read_messages':
            return await this.handleReadMessages(projectPath, args);

                    case 'send_message':

                      return await this.handleSendMessage(projectPath, args);

          

                    case 'get_agent_names':

                      return await this.handleGetAgentNames(projectPath, args);

          

                    case 'heartbeat':

                      return await this.handleHeartbeat(projectPath, args);

          

                    case 'search_messages':

                      return await this.handleSearchMessages(projectPath, args);

          

                    default:

                      throw new Error(`Unknown tool: ${name}`);

                  }

                } catch (error) {

                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

                  return {

                    content: [

                      {

                        type: 'text',

                        text: `Error: ${errorMessage}`,

                      },

                    ],

                  };

                }

              });

            }

          

            /**

             * Defines the available tools

             */

                      private getToolDefinitions(): Tool[] {

                        return [

                          {

                            name: 'read_messages',

                            description: 'Read messages from other agents in your project\'s shared chat room. Use this to catch up on the conversation and see what other agents are working on.',

                            inputSchema: {

                              type: 'object',

                              properties: {

                                count: {

                                  type: 'number',

                                  description: 'Number of recent messages to retrieve (max 100, optional)',

                                  minimum: 1,

                                  maximum: 100,

                                },

                                project_path: {

                                  type: 'string',

                                  description: 'The project path/folder (defaults to current working directory)',

                                },

                                since_timestamp: {

                                  type: 'string',

                                  description: 'ISO 8601 timestamp - retrieve messages after this time (e.g., "2024-01-15T10:30:00Z")',

                                },

                                last_seconds: {

                                  type: 'number',

                                  description: 'Retrieve messages from the last N seconds',

                                  minimum: 1,

                                },

                              },

                              required: [],

                            },

                          },

                          {

                            name: 'send_message',

                            description: 'Send a message to other agents in your project\'s shared chat room. Use this to coordinate tasks, share status updates, or ask for help.',

                            inputSchema: {

                              type: 'object',

                              properties: {

                                message: {

                                  type: 'string',

                                  description: 'The message content to send',

                                },

                                project_path: {

                                  type: 'string',

                                  description: 'The project path/folder (defaults to current working directory)',

                                },

                              },

                              required: ['message'],

                            },

                          },

                          {

                            name: 'search_messages',

                            description: 'Search the shared chat history for messages from any agent that match a specific query. Useful for finding past conversations or specific information.',

                            inputSchema: {

                              type: 'object',

                              properties: {

                                query: {

                                  type: 'string',

                                  description: 'The text to search for in the message content.',

                                },

                                project_path: {

                                  type: 'string',

                                  description: 'The project path/folder (defaults to current working directory)',

                                },

                              },

                              required: ['query'],

                            },

                          },

                          {

                            name: 'get_agent_names',

                            description: 'See which other agents are currently active in your project\'s chat room. This helps you know who you can collaborate with.',

                            inputSchema: {

                              type: 'object',

                              properties: {

                                project_path: {

                                  type: 'string',

                                  description: 'The project path/folder (defaults to current working directory)',

                                },

                              },

                            },

                          },

                                          {

                                            name: 'heartbeat',

                                            description: 'Signal your presence to other agents in the chat room. Use this during long-running tasks to let others know you are still online and active.',

                                            inputSchema: {

                                              type: 'object',

                                              properties: {

                                                project_path: {

                                                  type: 'string',

                                                  description: 'The project path/folder (defaults to current working directory)',

                                                },

                                              },

                                                                        },

                                                                      },

                                                                    ];

                                                                  }

          

            /**

             * Handles the read_messages tool

             */

            private async handleReadMessages(

              projectPath: string,

              args: any

            ): Promise<any> {

              // Determine which filtering approach to use

              let messages;

              const myName = this.chatManager.getMyName();

          

              if (args.since_timestamp || args.last_seconds !== undefined) {

                // Use advanced filtering if any timestamp-based filter is provided

                messages = await this.chatManager.getFilteredMessages(projectPath, {

                  sinceTimestamp: args.since_timestamp,

                  lastSeconds: args.last_seconds,

                  count: args.count,

                });

              } else if (args.count) {

                // Use simple count-based filtering

                messages = await this.chatManager.getLastMessages(projectPath, args.count);

              } else {

                // Default: get last 10 messages

                messages = await this.chatManager.getLastMessages(projectPath, 10);

              }

          

              const formattedMessages = messages.map((msg) => {

                const time = msg.timestamp.toLocaleTimeString();

                return `[${time}] ${msg.sender}: ${msg.content}`;

              });

          

              return {

                content: [

                  {

                    type: 'text',

                    text: `You are: ${myName}\n\nMessages retrieved: ${messages.length}\n${

                      formattedMessages.length > 0

                        ? formattedMessages.join('\n')

                        : '(No messages found)'

                    }`,

                  },

                ],

              };

            }

          

            /**

             * Handles the send_message tool

             */

            private async handleSendMessage(

              projectPath: string,

              args: any

            ): Promise<any> {

              const message = args.message as string;

          

              if (!message || message.trim().length === 0) {

                throw new Error('Message cannot be empty');

              }

          

              await this.chatManager.sendMessage(projectPath, message);

              const myName = this.chatManager.getMyName();

          

              return {

                content: [

                  {

                    type: 'text',

                    text: `Message sent successfully by ${myName}`,

                  },

                ],

              };

            }

          

            /**

             * Handles the search_messages tool

             */

            private async handleSearchMessages(

              projectPath: string,

              args: any

            ): Promise<any> {

              const query = args.query as string;

          

              if (!query || query.trim().length === 0) {

                throw new Error('Search query cannot be empty');

              }

          

              const messages = await this.chatManager.searchMessages(projectPath, query);

              const myName = this.chatManager.getMyName();

          

              const formattedMessages = messages.map((msg) => {

                const time = msg.timestamp.toLocaleTimeString();

                return `[${time}] ${msg.sender}: ${msg.content}`;

              });

          

              return {

                content: [

                  {

                    type: 'text',

                    text: `You are: ${myName}\n\nFound ${

                      messages.length

                    } messages matching "${query}":\n${

                      formattedMessages.length > 0

                        ? formattedMessages.join('\n')

                        : '(No messages found)'

                    }`,

                  },

                ],

              };

            }

          

            /**

             * Handles the get_agent_names tool

             */

            private async handleGetAgentNames(

              projectPath: string,

              args: any

            ): Promise<any> {

              const names = await this.chatManager.getAgentNames(projectPath);

              const myName = this.chatManager.getMyName();

          

              return {

                content: [

                  {

                    type: 'text',

                    text: `You are: ${myName}\n\nAgents in this chat room:\n${names.join(

                      ', '

                    )}`,

                  },

                ],

              };

            }

          

                        /**

          

                         * Handles the heartbeat tool

          

                         */

          

                        private async handleHeartbeat(

          

                          projectPath: string,

          

                          args: any

          

                        ): Promise<any> {

          

                          await this.chatManager.heartbeat(projectPath);

          

                          const myName = this.chatManager.getMyName();

          

                      

          

                          return {

          

                            content: [

          

                              {

          

                                type: 'text',

          

                                text: `Heartbeat sent successfully by ${myName}`,

          

                              },

          

                            ],

          

                          };

          

                        }

          

            

          

                        

          

              /**

          

               * Starts the MCP server

          

               */
  async start(): Promise<void> {
    // Initialize the chat manager (loads/creates agent identity)
    await this.chatManager.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    const stats = await this.chatManager.getStats();
    console.error('MCP Agent Messaging Server running on stdio');
    console.error(`Agent Name: ${stats.myName}`);
    console.error(`Total Chat Rooms: ${stats.totalChatRooms}`);
  }
}

// Start the server
const server = new AgentMessagingServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
