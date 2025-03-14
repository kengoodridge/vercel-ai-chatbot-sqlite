import type { Client } from "@libsql/client";

/**
 * Helper function to convert a JavaScript array to a vector string
 * for insertion into a F32_BLOB column
 * 
 * @param embedding Array of float values
 * @returns String formatted for the vector function
 */
export function arrayToVectorString(embedding: number[]): string {
  return JSON.stringify(embedding);
}

/**
 * Store vector embeddings in LibSQL table with F32_BLOB column
 * 
 * @param client LibSQL client
 * @param toolName Tool name
 * @param embedding Vector embedding (generated from the configured provider)
 */
export async function storeEmbedding(
  client: Client, 
  toolName: string, 
  embedding: number[]
): Promise<void> {
  try {
    // Format the embedding as a string for the vector function
    const vectorString = arrayToVectorString(embedding);
    
    // Get the dimension of the embedding
    const dimension = embedding.length;
    
    // First check the current table dimension to handle potential mismatches
    try {
      const tableInfo = await client.execute(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name='ToolEmbedding'
      `);
      
      if (tableInfo.rows.length > 0) {
        const tableDefinition = tableInfo.rows[0].sql as string;
        const dimensionMatch = tableDefinition.match(/F32_BLOB\((\d+)\)/);
        
        if (dimensionMatch && parseInt(dimensionMatch[1]) !== dimension) {
          console.warn(`⚠️ Embedding dimension mismatch: table expects ${dimensionMatch[1]}, but got ${dimension}`);
          console.warn(`⚠️ To fix this permanently, update the F32_BLOB size in migrations or run db:migrate again with the current provider`);
          
          // If this happens frequently, consider recreating the table with ALTER TABLE
          // For now, we'll just warn and continue (it might work if the new embedding is smaller than the column)
        }
      }
    } catch (error) {
      console.warn('Could not verify embedding dimension compatibility:', error);
    }
    
    // Store the embedding using LibSQL's vector function
    const result = await client.execute({
      sql: `
        INSERT INTO "ToolEmbedding" (tool_name, embedding, dimension, updated_at)
        VALUES (?, vector(?), ?, unixepoch())
        ON CONFLICT(tool_name) DO UPDATE 
        SET embedding = vector(?), dimension = ?, updated_at = unixepoch()
      `,
      args: [toolName, vectorString, dimension, vectorString, dimension]
    });
    
    if (result.rowsAffected === 0) {
      throw new Error(`Failed to store embedding for tool ${toolName}`);
    }
  } catch (error) {
    console.error(`Error storing embedding for tool ${toolName}:`, error);
    throw error;
  }
}

/**
 * Search for similar tools based on an embedding vector
 * 
 * @param client LibSQL client
 * @param embedding Query embedding vector
 * @param limit Maximum number of results
 * @returns Array of tool names sorted by similarity
 */
export async function searchSimilarTools(
  client: Client, 
  embedding: number[], 
  limit: number = 5
): Promise<string[]> {
  try {
    // Format the embedding as a string for the vector function
    const vectorString = arrayToVectorString(embedding);
    
    // Use LibSQL's vector_cosine_similarity for similarity search
    const result = await client.execute({
      sql: `
        SELECT e.tool_name, vector_cosine_similarity(e.embedding, vector(?)) as similarity
        FROM "ToolEmbedding" e
        ORDER BY similarity DESC
        LIMIT ?
      `,
      args: [vectorString, limit]
    });
    
    // Return just the tool names, sorted by similarity
    return result.rows.map(row => row.tool_name as string);
  } catch (error) {
    console.error('Error searching for similar tools:', error);
    throw error;
  }
}