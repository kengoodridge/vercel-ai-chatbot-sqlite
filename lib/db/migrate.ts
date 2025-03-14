import { config } from 'dotenv';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as fs from 'fs';
import * as path from 'path';
import { getEmbeddingDimension } from '../ai/embeddings';

config({
  path: '.env.local',
});

const runMigrate = async () => {
  // Get database URL from environment or use default
  const dbUrl = process.env.DATABASE_URL || 'file:./local.db';
  console.log(`Using database URL: ${dbUrl}`);
  
  // Get embedding dimension based on the configured provider
  let embeddingDimension = 768; // Default dimension
  try {
    embeddingDimension = await getEmbeddingDimension();
    console.log(`✓ Determined embedding dimension from provider: ${embeddingDimension}`);
  } catch (error) {
    console.warn(`⚠️ Using default embedding dimension (${embeddingDimension}):`, error);
  }
  
  // Create libSQL client
  const client = createClient({ url: dbUrl });
  // const db = drizzle(client);

  console.log('⏳ Running migrations...');
  const start = Date.now();

  try {
    // Get all SQL files in migrations-sqlite directory
    const migrationsDir = path.join(process.cwd(), 'lib/db/migrations-sqlite');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure migrations run in order
    
    console.log(`Found migration files: ${migrationFiles.join(', ')}`);
    
    // Process each migration file
    for (const migrationFile of migrationFiles) {
      console.log(`Processing migration file: ${migrationFile}`);
      const sqlFile = path.join(migrationsDir, migrationFile);
      let sql = fs.readFileSync(sqlFile, 'utf8');
      
      // Special handling for tool table migration that contains the embedding vector size
      if (migrationFile === '0004_tools_table.sql') {
        console.log(`⚙️ Dynamically setting embedding dimension to ${embeddingDimension} in ${migrationFile}`);
        
        // Replace the F32_BLOB size in the ToolEmbedding table
        sql = sql.replace(
          /embedding F32_BLOB\((\d+)\)/g, 
          `embedding F32_BLOB(${embeddingDimension})`
        );
        
        // Also update the dimension field default value
        sql = sql.replace(
          /dimension INTEGER NOT NULL DEFAULT (\d+)/g,
          `dimension INTEGER NOT NULL DEFAULT ${embeddingDimension}`
        );
      }
      
      // Split statements at statement-breakpoint
      const statements = sql.split('--> statement-breakpoint').map(stmt => stmt.trim()).filter(Boolean);
      
      // Execute each statement
      for (const statement of statements) {
        await client.execute(statement);
        console.log(`✓ Executed statement from ${migrationFile}`);
      }
    }

    const end = Date.now();
    console.log('✅ Migrations completed in', end - start, 'ms');
    
    // Close connection
    client.close();
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed');
    console.error(err);
    process.exit(1);
  }
};

runMigrate().catch((err) => {
  console.error('❌ Migration failed');
  console.error(err);
  process.exit(1);
});