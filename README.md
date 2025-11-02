# MCP Agent Messaging Server

A Model Context Protocol (MCP) server that enables agent-to-agent communication through project-based chat rooms. Each agent receives a unique German name and can communicate with other agents working in the same project directory.

## Features

- **Project-based Chat Rooms**: Separate chat rooms for each project path/directory
- **Persistent Storage**: Chat history saved to JSON files (one file per project)
- **Automatic Agent Naming**: Each agent receives a unique German name (Hans, Friedrich, Greta, etc.)
- **Real-time Messaging**: Agents can send and receive messages within their project chat
- **Agent Discovery**: See which agents are active in your project
- **Message History**: Read the last N messages from your chat room
- **System Notifications**: Automatic notifications when agents join or leave

## Architecture

The server is built with a clean, modular architecture:

```
src/
├── types.ts           # TypeScript type definitions
├── agent-namer.ts     # German name assignment system
├── persistence.ts     # JSON file persistence layer
├── chat-manager.ts    # Chat room and message management
└── index.ts           # MCP server implementation

data/                  # Chat history (one JSON file per project)
└── <sanitized_path>.json
```

### Components

- **AgentNamer**: Manages the pool of German names and assigns unique names to agents
- **PersistenceManager**: Handles saving/loading chat rooms to/from JSON files
- **ChatManager**: Handles chat room creation, message storage, and agent connections
- **MCP Server**: Exposes three tools for agent communication

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npm start
```

## Available Tools

### 1. `read_messages`

Read the last N messages from your project chat room.

**Parameters:**
- `count` (required): Number of recent messages to retrieve (1-100)
- `project_path` (optional): Project directory path (defaults to current working directory)

**Returns:**
- Your agent name
- List of messages in chronological order with timestamps

**Example:**
```json
{
  "count": 10,
  "project_path": "/path/to/project"
}
```

### 2. `send_message`

Send a message to your project chat room.

**Parameters:**
- `message` (required): The message content to send
- `project_path` (optional): Project directory path (defaults to current working directory)

**Returns:**
- Confirmation with your agent name

**Example:**
```json
{
  "message": "I've completed the authentication module",
  "project_path": "/path/to/project"
}
```

### 3. `get_agent_names`

Get the names of all agents currently active in your project chat room.

**Parameters:**
- `project_path` (optional): Project directory path (defaults to current working directory)

**Returns:**
- Your agent name
- List of all active agent names in the chat

**Example:**
```json
{
  "project_path": "/path/to/project"
}
```

### 4. `heartbeat`

Signal that you are still active. This updates your "last seen" status.

**Parameters:**
- `project_path` (optional): Project directory path (defaults to current working directory)

**Returns:**
- Confirmation with your agent name

**Example:**
```json
{
  "project_path": "/path/to/project"
}
```

## How It Works

1. **Instance Startup**: Each MCP server instance represents ONE agent
2. **Identity Creation**: On first start, agent gets a unique German name (stored in `.agent-identity.json`)
3. **Identity Persistence**: The agent keeps the same name across restarts
4. **Message Sending**: Agent reloads chat from disk, adds message, saves back to disk
5. **Message Reading**: Agent always reloads from disk to see messages from other instances
6. **Agent Discovery**: Active agents are derived from recent messages in the chat history
7. **File-Based Communication**: All instances share the same `data/` directory for cross-agent messaging

## Persistence

### Agent Identity
Each instance stores its identity in `.agent-identity.json`:
```json
{
  "name": "Hans",
  "createdAt": "2025-11-01T18:30:00.000Z"
}
```

**Important**: Don't delete this file unless you want the instance to get a new name!

### Chat History
Chat history is automatically saved to JSON files in the `data/` directory:

- **One file per project**: Each project gets its own JSON file based on its path
- **Automatic saving**: Messages are saved immediately when sent
- **Automatic loading**: Chat history is reloaded from disk before every operation
- **File naming**: Project paths are sanitized to create filesystem-safe filenames
  - Example: `/Users/dev/my-project` → `_Users_dev_my_project.json`

**Data Location**: `./data/<sanitized_path>.json`

**Data Format**: Each file contains:
```json
{
  "projectPath": "/path/to/project",
  "messages": [
    {
      "sender": "System",
      "content": "Chat room created by Hans",
      "timestamp": "2025-11-01T18:30:15.000Z"
    },
    {
      "sender": "Hans",
      "content": "Starting work on the login page",
      "timestamp": "2025-11-01T18:31:22.000Z"
    },
    {
      "sender": "Friedrich",
      "content": "I'll handle the backend API",
      "timestamp": "2025-11-01T18:32:45.000Z"
    }
  ],
  "createdAt": "2025-11-01T18:30:00.000Z"
}
```

## Example Usage Scenario

```typescript
// Agent 1 (Hans) in /project/frontend
send_message({ message: "Starting work on the login page" })

// Agent 2 (Friedrich) joins /project/frontend
// System: "Friedrich has joined the chat"

read_messages({ count: 5 })
// Output:
// You are: Friedrich
// Last 5 message(s):
// [10:30:15] System: Hans has joined the chat
// [10:31:22] Hans: Starting work on the login page
// [10:32:10] System: Friedrich has joined the chat

get_agent_names()
// Output:
// You are: Friedrich
// Agents in this chat room:
// Hans, Friedrich

// Friedrich sends a message
send_message({ message: "I'll handle the backend API" })
```

## German Names

The server includes 50 traditional German names (25 male, 25 female):

**Male names**: Hans, Friedrich, Karl, Wilhelm, Otto, Heinrich, Hermann, Ernst, Paul, Werner, Walter, Franz, Josef, Ludwig, Georg, Klaus, Günter, Dieter, Helmut, Jürgen, Gerhard, Wolfgang, Horst, Manfred, Bernd

**Female names**: Greta, Frieda, Margarete, Emma, Anna, Liesel, Helga, Gertrud, Ingrid, Monika, Ursula, Brigitte, Christa, Renate, Petra, Sabine, Heike, Katrin, Claudia, Stefanie, Anke, Ute, Beate, Karin, Martina

If more than 50 agents are active, names will be suffixed with numbers (e.g., Hans2, Friedrich2).

## Configuration for Claude Code

### Important: Multi-Instance Architecture

Each Claude Code agent runs **its own instance** of this MCP server. Agents communicate by reading/writing shared JSON files in the `data/` directory.

**How it works:**
1. Agent 1 (Hans) runs instance A → writes to `data/project_x.json`
2. Agent 2 (Friedrich) runs instance B → reads from `data/project_x.json`
3. They see each other's messages through the shared file

### Setup Instructions

1. **Build the project** (if you haven't already):
   ```bash
   cd /Users/janspoerer/code/miscellaneous/mcp_agent_messenging
   npm install
   npm run build
   ```

2. **Add to Claude Code settings**:
   - Open Claude Code settings
   - Add the MCP server configuration:

```json
{
  "mcpServers": {
    "agent-messaging": {
      "command": "node",
      "args": [
        "/Users/janspoerer/code/miscellaneous/mcp_agent_messenging/dist/index.js"
      ]
    }
  }
}
```

3. **Start using it**:
   - Each Claude Code instance will get a unique German name
   - The name persists in `.agent-identity.json`
   - All agents in the same project path share messages via `data/` folder

### Multiple Agents Example

```bash
# Agent 1 terminal
claude-code
# Gets name "Hans", can use send_message

# Agent 2 terminal (same data/ folder)
claude-code
# Gets name "Friedrich", can use read_messages to see Hans's messages
```

## Development

```bash
# Install dependencies
npm install

# Build and run
npm run dev
```

## TypeScript Types

All core types are defined in `src/types.ts`:

- `Message`: Individual chat messages with sender, content, and timestamp
- `ChatRoom`: Chat room data including agents and message history
- `AgentConnection`: Agent connection metadata

The `src/persistence.ts` module handles all file I/O operations with automatic serialization/deserialization.

## Error Handling

The server handles common error cases:

- Agent not connected: Automatically connects on first tool call
- Empty messages: Rejected with error message
- Invalid message count: Must be between 1-100
- Chat room not found: Returns empty arrays/lists

## License

MIT
