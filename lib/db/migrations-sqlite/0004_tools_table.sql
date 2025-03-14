    CREATE TABLE IF NOT EXISTS "Tool" (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      input_schema TEXT NOT NULL,
      output_schema TEXT,
      category TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
--> statement-breakpoint
    -- Create tool tags table
    CREATE TABLE IF NOT EXISTS "ToolTag" (
      tool_name TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (tool_name, tag),
      FOREIGN KEY (tool_name) REFERENCES "Tool"(name) ON DELETE CASCADE
    );
--> statement-breakpoint
    -- Create tool embeddings table with F32_BLOB for vector data
    -- This uses libSQL's native vector type
    -- Note: The embedding dimension (768) is for Google Gemini or Ollama with nomic-embed-text
    -- If using a different model, adjust the embedding dimension accordingly:
    -- - OpenAI embeddings: 1536 dimensions
    -- - Google Gemini embeddings: usually 768 dimensions
    -- - Ollama nomic-embed-text: 768 dimensions
    CREATE TABLE IF NOT EXISTS "ToolEmbedding" (
      tool_name TEXT PRIMARY KEY,
      embedding F32_BLOB(768) NOT NULL,
      dimension INTEGER NOT NULL DEFAULT 768,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tool_name) REFERENCES "Tool"(name) ON DELETE CASCADE
    );
--> statement-breakpoint
    CREATE INDEX IF NOT EXISTS tools_vec_idx ON ToolEmbedding (
     libsql_vector_idx(embedding, 'metric=cosine')
   )
--> statement-breakpoint
    -- Create FTS index for text search
    CREATE VIRTUAL TABLE IF NOT EXISTS tools_fts USING fts5(
      name, description, input_schema, output_schema, category, tags,
      content='"Tool"',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );
--> statement-breakpoint
    -- Create triggers to maintain FTS index
    CREATE TRIGGER IF NOT EXISTS tool_ai AFTER INSERT ON "Tool" BEGIN
      INSERT INTO tools_fts(rowid, name, description, input_schema, output_schema, category, tags)
      VALUES (
        new.rowid, 
        new.name, 
        new.description, 
        new.input_schema, 
        COALESCE(new.output_schema, ''), 
        COALESCE(new.category, ''),
        ''  -- Tags will be updated separately
      );
    END;
--> statement-breakpoint 
    CREATE TRIGGER IF NOT EXISTS tool_ad AFTER DELETE ON "Tool" BEGIN
      DELETE FROM tools_fts WHERE rowid = old.rowid;
    END;
--> statement-breakpoint
    CREATE TRIGGER IF NOT EXISTS tool_au AFTER UPDATE ON "Tool" BEGIN
      DELETE FROM tools_fts WHERE rowid = old.rowid;
      INSERT INTO tools_fts(rowid, name, description, input_schema, output_schema, category, tags)
      VALUES (
        new.rowid, 
        new.name, 
        new.description, 
        new.input_schema, 
        COALESCE(new.output_schema, ''), 
        COALESCE(new.category, ''),
        (SELECT GROUP_CONCAT(tag, ' ') FROM "ToolTag" WHERE tool_name = new.name)
      );
    END;