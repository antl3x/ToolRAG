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
        embedding BLOB NOT NULL,
        embedding_text TEXT NOT NULL,
        tool_json TEXT NOT NULL
      )
    `);

    // Create an index on tool_hash for efficient lookups if it doesn't exist
    await this._db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tool_hash ON ${this._db_table_name()}(tool_hash)
    `);

    // Create vector index on the embedding column if it doesn't exist
    await this._db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tool_embeddings_vector 
      ON ${this._db_table_name()}(libsql_vector_idx(embedding))
    `);

    this._log.info('Ensured tool_embeddings table exists with proper schema');

    this._log.info(`Connected to database at ${this._config.database.url}`);
  } catch (error) {
    this._log.error('Failed to initialize database:', error);
    throw error;
  }
} 