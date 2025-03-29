# ToolRAG 🛠️

> Infinity functions, zero context limits — unlock the full potential of LLM function calling without the constraints

**Context-aware tool retrieval for language models**

ToolRAG provides a seamless solution for using an unlimited number of function definitions with Large Language Models (LLMs), without worrying about context window limitations, costs, or performance degradation.

## 🌟 Key Features

- **Unlimited Tool Definitions**: Say goodbye to context window constraints. ToolRAG dynamically selects only the most relevant tools for each query.
- **Semantic Tool Search**: Uses vector embeddings to find the most contextually relevant tools for a given user query.
- **Cost Optimization**: Reduces token usage by only including the most relevant function definitions.
- **Performance Improvement**: Prevents performance degradation that occurs when overwhelming LLMs with too many function definitions.
- **MCP Integration**: Works with any Model Context Protocol (MCP) compliant servers, enabling access to a wide ecosystem of tools.
- **OpenAI Compatible**: Format tools as OpenAI function definitions for seamless integration.

## 🔍 How It Works

1. **Tool Registration**: ToolRAG connects to MCP servers and registers available tools.
2. **Embedding Generation**: Tool descriptions and parameters are embedded using vector embeddings (OpenAI or Google).
3. **Query Analysis**: When a user query comes in, ToolRAG finds the most relevant tools via semantic search.
4. **Tool Execution**: Execute selected tools against the appropriate MCP servers.

## 🚀 Quick Start

```typescript
import { ToolRAG } from "@antl3x/toolrag";
import OpenAI from "openai";

// Initialize ToolRAG with MCP servers
const toolRag = await ToolRAG.init({
  mcpServers: [
    "https://mcp.pipedream.net/token/google_calendar",
    "https://mcp.pipedream.net/token/stripe",
    // Add as many tool servers as you need!
  ],
});

const userQuery =
  "What events do I have tomorrow? Also, check my stripe balance.";

// Get relevant tools for a specific query
const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-4o",
  input: userQuery,
  tools: await toolRag.listTools(userQuery),
});

// Execute the function calls from the LLM response
for (const call of response.output.filter(
  (item) => item.type === "function_call"
)) {
  const result = await toolRag.callTool(call.name, JSON.parse(call.arguments));
  console.log(result);
}
```

## 🏗️ Architecture

ToolRAG uses a Retrieval-Augmented Generation (RAG) approach optimized for tools:

1. **Storage**: LibSQL database to store tool definitions and their vector embeddings
2. **Retrieval**: Cosine similarity search to find the most relevant tools
3. **Execution**: Direct integration with MCP servers for tool execution

## 👨‍💻 Use Cases

- **Multi-tool AI Assistants**: Build assistants that can access hundreds of APIs
- **Enterprise Systems**: Connect to internal tools and services without context limits
- **AI Platforms**: Provide a unified interface for tool discovery and execution

## 🔧 Configuration Options

ToolRAG offers flexible configuration options:

- Multiple embedding providers (OpenAI, Google)
- Customizable relevance thresholds
- Database configuration for persistence

## 📝 License

Apache License 2.0
