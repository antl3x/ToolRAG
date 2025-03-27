import type { Client as LibSQLClient } from '@libsql/client';
import { createClient } from '@libsql/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { log } from '@utils.js';
import crypto from 'crypto';
import { Tool as OpenAITool } from 'openai/src/resources/responses/responses.js';
import { z } from 'zod';
import type { EmbeddingProvider } from './EmbeddingProvider.js';
import { EmbeddingProviderGoogle } from './EmbeddingProviderGoogle.js';
import { EmbeddingProviderOpenAI } from './EmbeddingProviderOpenAI.js';
import { setupConfig, ToolRAGConfig, ToolRAGConfigInput } from './ToolRAGConfig';

// Define reranking configuration type
export interface RerankConfig {
  enabled: boolean;
  // Add model-specific settings or API keys if needed
  threshold?: number; // Optional threshold to filter out low-relevance tools
}

class ToolRAG {
  private _mcpClients: Client[] = [];
  private _mcpTools: MCPTool[] = [];
  private _embeddingProvider: EmbeddingProvider | null = null;
  private _db: LibSQLClient | null = null;
  private _config: ToolRAGConfig;
  private _log = log('toolreg:ToolRAG');
  private _db_table_name = () => `tool_embeddings_${this._embeddingProvider?.getName()}`;

  constructor(config?: ToolRAGConfigInput) {
    this._config = setupConfig(config);
  }

  static async init(config?: ToolRAGConfigInput) {
    const toolRAG = new ToolRAG(config);
    await toolRAG._initEmbeddingProvider();
    await toolRAG._initDatabase();
    await toolRAG._initMcpServers();
    toolRAG._log.info('ToolRAG initialized');

    return toolRAG;
  }

  private _initEmbeddingProvider() {
    switch (this._config.embeddingProvider) {
      case 'openai':
        this._embeddingProvider = new EmbeddingProviderOpenAI();
        break;
      case 'google':
        this._embeddingProvider = new EmbeddingProviderGoogle();
        break;
      default:
        throw new Error(`Unsupported embedding provider: ${this._config.embeddingProvider}`);
    }
  }

  private async _initMcpServers() {
    if (this._config.mcpServers?.length) {
      this._log.info(`Initializing with ${this._config.mcpServers.length} MCP servers`);
      await Promise.all(this._config.mcpServers.map((server) => this._registerMcpServer(server)));
    }
  }

  /**
   * Compute a hash from a tool's schema for efficient tracking
   * @param tool The tool to hash
   * @returns A string hash that uniquely identifies the tool's schema
   */
  private _hashTool(tool: MCPTool): string {
    // Create a string representation of the tool's schema
    const schemaString = JSON.stringify(tool);
    // Create a SHA-256 hash of the schema
    return crypto.createHash('sha256').update(schemaString).digest('hex');
  }

  async _initDatabase() {
    try {
      this._db = createClient({
        url: this._config.database.url,
      });

      // Create a tool embeddings table with hash for tracking changes and proper vector column
      await this._db.execute(`
        CREATE TABLE IF NOT EXISTS ${this._db_table_name()} (
          id INTEGER PRIMARY KEY,
          tool_name TEXT NOT NULL,
          tool_hash TEXT NOT NULL,
          embedding F32_BLOB(${this._embeddingProvider?.getDimensions()}) NOT NULL,
          embedding_text TEXT NOT NULL,
          tool_json TEXT NOT NULL
        )
      `);

      // Create an index on tool_hash for efficient lookups
      await this._db.execute(`
        CREATE INDEX IF NOT EXISTS idx_tool_hash ON ${this._db_table_name()}(tool_hash)
      `);

      // Create vector index on the embedding column
      await this._db.execute(`
        CREATE INDEX IF NOT EXISTS idx_tool_embeddings_vector 
        ON ${this._db_table_name()}(libsql_vector_idx(embedding))
      `);

      this._log.info('Created tool_embeddings table with proper schema');

      this._log.info(`Connected to database at ${this._config.database.url}`);
    } catch (error) {
      this._log.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async _registerMcpServer(url: string) {
    const client = new Client({
      name: url,
      version: '0',
    });

    await client.connect(new SSEClientTransport(new URL(url)));
    this._mcpClients.push(client);

    const res = await client.listTools();
    this._log.info(`Found ${res.tools.length} tools from ${url}`);
    this._log.info(res.tools.map((tool) => tool.name).join(', '));
    this._mcpTools.push(...res.tools);
    await this._refreshToolsEmbeddings();
  }

  async _generateToolsEmbeddings(tools: MCPTool[]) {
    if (!this._embeddingProvider) {
      throw new Error('Embedding provider not initialized. Call initEmbeddingProvider() first.');
    }

    // Generate text for each tool
    const toolTextChunks = tools.map((tool) => {
      const params = tool.inputSchema.properties
        ? Object.entries(tool.inputSchema.properties)
            .map(
              ([paramName, paramSchema]: [string, any]) =>
                `    ${paramName} [${paramSchema.type}]: ${paramSchema?.description || ''}`
            )
            .join('\n')
        : '';

      // Replace -_ characters with spaces
      const toolName = tool.name.replaceAll(/-|_/g, ' ');

      this._log.debug(`${toolName}: ${tool?.description || ''}\n${params}`);
      return `${toolName}: ${tool?.description || ''}\n${params}`;
    });

    // Generate embeddings for each tool
    const embeddings = await Promise.all(
      toolTextChunks.map(async (text, index) => {
        const embedding = await this._embeddingProvider!.getEmbedding(text);

        return {
          tool: tools[index],
          toolName: tools[index].name,
          toolHash: this._hashTool(tools[index]),
          embedding,
          toolText: text,
        };
      })
    );

    return embeddings;
  }

  /**
   * Efficiently update embeddings in the database, only generating new ones for
   * tools that have changed or are newly added
   */
  private async _refreshToolsEmbeddings() {
    if (!this._db) {
      throw new Error('Database not initialized. Call _initDatabase() first.');
    }

    if (!this._embeddingProvider) {
      throw new Error('Embedding provider not initialized. Call initEmbeddingProvider() first.');
    }

    this._log.info('Checking for new or updated tools...');

    // Calculate hashes for all current tools
    const toolsWithHashes = this._mcpTools.map((tool) => ({
      tool,
      hash: this._hashTool(tool),
    }));

    // Get all existing tool hashes from the database
    const existingHashes = await this._db.execute({
      sql: `SELECT tool_hash FROM ${this._db_table_name()}`,
      args: [],
    });

    // Create a Set of existing hashes for fast lookup
    const hashSet = new Set(existingHashes.rows.map((row) => row.tool_hash as string));

    // Find tools that need embedding updates (not in database or hash changed)
    const toolsToUpdate = toolsWithHashes.filter(({ hash }) => !hashSet.has(hash));

    if (toolsToUpdate.length === 0) {
      this._log.info('All tools are up-to-date, no new embeddings needed');
      return [];
    }

    this._log.info(`Generating embeddings for ${toolsToUpdate.length} new or updated tools...`);

    // Generate embeddings only for the tools that need updating
    const newEmbeddings = await this._generateToolsEmbeddings(
      toolsToUpdate.map(({ tool }) => tool)
    );

    try {
      // Insert each new embedding
      for (const { toolName, toolText, toolHash, embedding, tool } of newEmbeddings) {
        const toolJson = JSON.stringify(tool);

        // Convert embedding array to Float32Array for proper binary storage
        const embeddingBuffer = new Float32Array(embedding).buffer;

        // First try to update existing tool by name (if hash changed)
        const updateResult = await this._db.execute({
          sql: `
            UPDATE ${this._db_table_name()} 
            SET tool_hash = ?, embedding = ?, tool_json = ?, embedding_text = ?
            WHERE tool_name = ?
          `,
          args: [toolHash, embeddingBuffer, toolJson, toolText, toolName],
        });

        // If no rows were updated, this is a new tool, so insert it
        if (!updateResult.rowsAffected) {
          await this._db.execute({
            sql: `
              INSERT INTO ${this._db_table_name()} (tool_name, tool_hash, embedding, tool_json, embedding_text)
              VALUES (?, ?, ?, ?, ?)
            `,
            args: [toolName, toolHash, embeddingBuffer, toolJson, toolText],
          });
        }
      }

      this._log.info(`Successfully updated embeddings for ${newEmbeddings.length} tools`);

      return newEmbeddings;
    } catch (error) {
      this._log.error('Error updating embeddings:', error);
      throw error;
    }
  }

  /**
   * Remove tools from the database that are no longer present in _mcpTools
   * This prevents recommending tools that don't exist anymore from old servers
   * @returns The number of tools removed from the database
   * @private
   */
  async _pruneMissingTools() {
    if (!this._db) {
      throw new Error('Database not initialized. Call _initDatabase() first.');
    }

    this._log.info('Pruning missing tools from database...');

    try {
      // Get all tool names from the database
      const dbToolsResult = await this._db.execute({
        sql: `SELECT tool_name FROM ${this._db_table_name()}`,
        args: [],
      });

      // Extract tool names from the result
      const dbToolNames = dbToolsResult.rows.map((row) => row.tool_name as string);

      // Get current tool names from _mcpTools
      const currentToolNames = this._mcpTools.map((tool) => tool.name);

      // Find tool names that are in the database but not in _mcpTools
      const toolsToRemove = dbToolNames.filter((name) => !currentToolNames.includes(name));

      if (toolsToRemove.length === 0) {
        this._log.info('No tools to prune, database is in sync with registered tools');
        return 0;
      }

      this._log.info(`Found ${toolsToRemove.length} tools to remove from database`);

      // Delete each tool that's no longer available
      for (const toolName of toolsToRemove) {
        await this._db.execute({
          sql: `DELETE FROM ${this._db_table_name()} WHERE tool_name = ?`,
          args: [toolName],
        });
        this._log.debug(`Removed tool ${toolName} from database`);
      }

      this._log.info(`Successfully pruned ${toolsToRemove.length} tools from database`);
      return toolsToRemove.length;
    } catch (error) {
      this._log.error('Error pruning missing tools:', error);
      throw error;
    }
  }

  /**
   * Internal method to find similar tools using vector similarity
   * @private
   */
  async _findSimilarToolsByVector(query: string) {
    if (!this._db) {
      throw new Error('Database not initialized. Call _initDatabase() first.');
    }

    if (!this._embeddingProvider) {
      throw new Error('Embedding provider not initialized. Call initEmbeddingProvider() first.');
    }

    // Generate embedding for the query
    const queryEmbedding = await this._embeddingProvider.getEmbedding(query);
    const queryEmbeddingBuffer = new Float32Array(queryEmbedding).buffer;

    // Use vector_top_k to find similar tools using the vector index
    const result = await this._db.execute({
      sql: `
            SELECT te.id, te.tool_name, te.tool_json, 
                   vector_distance_cos(te.embedding, ?) as distance
            FROM vector_top_k('idx_tool_embeddings_vector', ?, 40) AS vt
            JOIN ${this._db_table_name()} te ON te.id = vt.id
          `,
      args: [queryEmbeddingBuffer, queryEmbeddingBuffer],
    });

    this._log.info(`Found ${result.rows.length} similar tools via vector search`);

    // Transform the results
    return result.rows.map((row) => {
      const toolName = row.tool_name as string;
      let tool: MCPTool | undefined;
      tool = JSON.parse(row.tool_json as string);

      // Convert distance to relevance (1.0 = perfect match, 0.0 = completely unrelated)
      // Since cosine distance = 1 - cosine similarity
      const relevance = 1 - (row.distance as number);

      return {
        toolName,
        relevance,
        tool,
      };
    });
  }

  private _convertToOpenAIFunction(
    tool: MCPTool | undefined,
    relevance: number
  ): OpenAITool & {
    relevance: number;
  } {
    if (!tool) {
      throw new Error('Cannot convert undefined tool to OpenAI function format');
    }

    // Convert the tool to OpenAI function format
    return {
      type: 'function',
      name: tool.name,
      description: tool.description || '',
      parameters: {
        type: 'object',
        properties: tool.inputSchema.properties || {},
        required: Object.entries(tool.inputSchema.properties || {})
          .filter(([_, schema]: [string, any]) => !schema.optional)
          .map(([key]) => key),
        additionalProperties: false,
      },
      strict: true,
      relevance,
    };
  }

  /**
   * Filters tools based on a user query using vector similarity search
   * @param query User query like "any important event today?"
   * @param limit Maximum number of tools to return
   * @returns Array of most relevant tools for the query
   */
  async listTools(query: string, options?: { relevanceThreshold?: number }): Promise<OpenAITool[]> {
    const { relevanceThreshold = 0.15 } = options || {};
    // First check if we have embeddings in the database
    if (!this._db) {
      // No database connection, fall back to all tools
      throw new Error('No database connection');
    }

    // We always prune missing tools from the database
    // Prune tools that are no longer available
    const removedCount = await this._pruneMissingTools();
    if (removedCount > 0) {
      this._log.info(`Pruned ${removedCount} tools that are no longer available`);
    }

    // Check if we have tools in the database
    const count = await this._db.execute(`SELECT COUNT(*) as count FROM ${this._db_table_name()}`);
    const toolCount = (count.rows[0].count as number) || 0;

    if (toolCount === 0) {
      // No tools in database, try to store them first
      this._log.warn('No tool embeddings found in database, storing them now');
      await this._refreshToolsEmbeddings();
    }

    // Get initial candidate pool - retrieve more than needed if reranking

    const similarTools = await this._findSimilarToolsByVector(query);

    // Filter out tools below the relevance threshold
    const filteredTools = similarTools.filter(({ relevance }) => relevance >= relevanceThreshold);

    // Transform results to OpenAI function format
    return filteredTools.map(({ tool, relevance }) =>
      this._convertToOpenAIFunction(tool, relevance)
    );
  }
}

const mcpToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()).optional(),
  }),
});

type MCPTool = z.infer<typeof mcpToolSchema>;

export default ToolRAG;
