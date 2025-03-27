# ToolRAG SDK

ToolRAG is a TypeScript library for efficiently managing tools with vector-based semantic search across different embedding providers.

## Features

- Register tools from MCP (Model Context Protocol) servers
- Store tool embeddings in a SQLite database (via libsql)
- Search for relevant tools semantically by query
- Efficient embedding caching with hash-based tracking
- Support for multiple embedding providers (OpenAI, Google Vertex AI)

## Installation

```bash
npm install @toolreg-sdk
# or
yarn add @toolreg-sdk
# or
pnpm add @toolreg-sdk
```

## Usage

```typescript
import ToolRAG from '@toolreg-sdk';

// Initialize ToolRAG with embedding provider configuration
const toolReg = new ToolRAG({
  // Use OpenAI embeddings
  embeddingProvider: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'text-embedding-3-small', // optional, defaults to text-embedding-3-small
  },
  // Or use Google embeddings
  // embeddingProvider: {
  //   type: 'google',
  //   projectId: process.env.GOOGLE_CLOUD_PROJECT,
  //   location: 'us-central1', // optional, defaults to us-central1
  //   model: 'text-embedding-005' // optional, defaults to text-embedding-005
  // },
  dbUrl: 'file:toolreg.db', // SQLite database URL
});

// Register tools from MCP servers
await toolReg.registerMcpServer('https://your-mcp-server-url');

// Update embeddings efficiently (only generates for new or changed tools)
await toolReg.updateEmbeddings();

// Search for relevant tools based on a query
const relevantTools = await toolReg.listToolsFiltered('schedule a meeting for tomorrow', {
  limit: 3, // optional, number of tools to return
  includeRelevance: true, // optional, include relevance scores
});

console.log(relevantTools);
```

## Environment Variables

- `OPENAI_API_KEY`: API key for OpenAI (required if using OpenAI provider)
- `OPENAI_EMBED_MODEL`: Model to use for OpenAI embeddings (default: 'text-embedding-3-small')
- `GOOGLE_CLOUD_PROJECT`: Google Cloud project ID (required if using Google provider)
- `GOOGLE_LOCATION`: Google Cloud location (default: 'us-central1')
- `GOOGLE_EMBED_MODEL`: Model to use for Google embeddings (default: 'text-embedding-005')
- `LIBSQL_URL`: URL for libsql database (default: 'file:toolreg.db')

## License

MIT
