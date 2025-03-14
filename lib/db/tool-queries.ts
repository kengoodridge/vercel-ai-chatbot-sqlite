import { eq, like, and, SQL, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { tool, toolTag, toolEmbedding } from './schema';
import { getEmbedding } from '../ai/embeddings';
import { storeEmbedding, searchSimilarTools } from './sqlite-extensions';

// Interface for tool search options
export interface ToolSearchOptions {
  name?: string;
  category?: string;
  tags?: string[];
  freeText?: string;
  vectorSearch?: string; // Text to be converted to vector for similarity search
  limit?: number;
}

// Tool with tags
export interface ToolWithTags {
  name: string;
  description: string;
  inputSchema: string | null | undefined;
  outputSchema: string | null | undefined;
  category: string | null | undefined;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Function to get database connection
export function getDb() {
  const dbUrl = process.env.DATABASE_URL || 'file:./local.db';
  const client = createClient({ url: dbUrl });
  return {
    db: drizzle(client),
    client,
  };
}

// Create a new tool
export async function createTool(
  toolData: {
    name: string;
    description: string;
    inputSchema: string;
    outputSchema?: string;
    category?: string;
    tags?: string[];
  }
) {
  const { db, client } = getDb();
  
  try {
    // Insert tool
    await db.insert(tool).values({
      name: toolData.name,
      description: toolData.description,
      inputSchema: toolData.inputSchema,
      outputSchema: toolData.outputSchema,
      category: toolData.category,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // Insert tags if provided
    if (toolData.tags && toolData.tags.length > 0) {
      const tagValues = toolData.tags.map(tag => ({
        toolName: toolData.name,
        tag
      }));
      
      await db.insert(toolTag).values(tagValues);
    }
    
    try {
      // Generate text for embedding
      const toolText = `${toolData.name} ${toolData.description} ${toolData.inputSchema} ${toolData.outputSchema || ''} ${toolData.category || ''}`;
      
      // Add tags to the text
      const tagsText = toolData.tags ? toolData.tags.join(' ') : '';
      const fullText = `${toolText} ${tagsText}`;
      
      // Generate embedding with the configured provider
      const embedding = await getEmbedding(fullText);
      
      // Store embedding in F32_BLOB column
      await storeEmbedding(client, toolData.name, embedding);
    } catch (error) {
      console.error(`Error generating embeddings for tool ${toolData.name}:`, error);
      // Continue without embeddings if there's an error
    }
    
    return { success: true };
  } finally {
    // Close the connection
    if (client) {
      client.close();
    }
  }
}

// Get a tool by name
export async function getToolByName(name: string): Promise<ToolWithTags | null> {
  const { db, client } = getDb();
  
  try {
    // Get the tool
    const tools = await db
      .select()
      .from(tool)
      .where(eq(tool.name, name));
    
    if (tools.length === 0) {
      return null;
    }
    
    // Get tags for the tool
    const tags = await db
      .select()
      .from(toolTag)
      .where(eq(toolTag.toolName, name));
    
    // Return tool with tags
    return {
      ...tools[0],
      tags: tags.map(tag => tag.tag),
    };
  } finally {
    // Close connection
    if (client) {
      client.close();
    }
  }
}

// Search for tools
export async function searchTools(options: ToolSearchOptions): Promise<ToolWithTags[]> {
  const { db, client } = getDb();
  const limit = options.limit || 10;
  let results: any[] = [];
  
  try {
    // Vector search if vectorSearch is provided
    if (options.vectorSearch) {
      try {
        // Get query embedding from configured provider
        const queryEmbedding = await getEmbedding(options.vectorSearch);
        
        // Get tool names sorted by vector similarity
        const toolNames = await searchSimilarTools(client, queryEmbedding, limit);
        
        if (toolNames.length > 0) {
          // Get the full tool information
          results = await db
            .select()
            .from(tool)
            .where(sql`${tool.name} IN ${toolNames}`);
            
          // Sort results to match similarity order
          results.sort((a, b) => {
            const aIndex = toolNames.indexOf(a.name);
            const bIndex = toolNames.indexOf(b.name);
            return aIndex - bIndex;
          });
        }
      } catch (error) {
        console.error('Vector search error:', error);
        // Fall back to text search if vector search fails
      }
    }
    // Search using FTS5 if free text is provided
    else if (options.freeText) {
      try {
        // Use FTS5 for full-text search with raw SQL
        const result = await client.execute({
          sql: `
            SELECT t.name, t.description, t.input_schema, t.output_schema, t.category, 
                   t.created_at, t.updated_at
            FROM tools_fts
            JOIN "Tool" t ON tools_fts.rowid = t.rowid
            WHERE tools_fts MATCH ?
            ORDER BY rank
            LIMIT ?
          `,
          args: [options.freeText, limit]
        });
        
        // Map results to match expected format
        results = result.rows.map(row => ({
          name: row.name,
          description: row.description,
          inputSchema: row.input_schema,
          outputSchema: row.output_schema,
          category: row.category,
          createdAt: new Date(row.created_at as number * 1000),
          updatedAt: new Date(row.updated_at as number * 1000),
        }));
      } catch (error) {
        console.error('FTS search error:', error);
        // Fall back to basic search with LIKE
        results = await db
          .select()
          .from(tool)
          .where(like(tool.description, `%${options.freeText}%`))
          .limit(limit);
      }
    }
    // Standard search with filters
    else {
      let conditions: SQL<unknown>[] = [];
      
      if (options.name) {
        conditions.push(like(tool.name, `%${options.name}%`));
      }
      
      if (options.category) {
        conditions.push(eq(tool.category, options.category));
      }
      
      // Execute query
      if (conditions.length > 0) {
        results = await db
          .select()
          .from(tool)
          .where(and(...conditions))
          .limit(limit);
      } else {
        // No filters, return all tools
        results = await db
          .select()
          .from(tool)
          .limit(limit);
      }
    }
    
    // Get tags for all tools
    const toolNames = results.map(t => t.name);
    let tags: any[] = [];
    
    if (toolNames.length > 0) {
      // Only get tags if we have tools
      tags = await db
        .select()
        .from(toolTag)
        .where(sql`${toolTag.toolName} IN ${toolNames}`);
    }
    
    // Filter by tags if specified
    if (options.tags && options.tags.length > 0) {
      // Group tags by tool name
      const tagsByTool = tags.reduce((acc, tag) => {
        acc[tag.toolName] = acc[tag.toolName] || [];
        acc[tag.toolName].push(tag.tag);
        return acc;
      }, {} as Record<string, string[]>);
      
      // Filter tools that have ALL the specified tags
      results = results.filter(tool => {
        const toolTags = tagsByTool[tool.name] || [];
        return options.tags!.every(tag => toolTags.includes(tag));
      });
    }
    
    // Map tags to each tool
    return results.map(tool => ({
      ...tool,
      tags: tags
        .filter(tag => tag.toolName === tool.name)
        .map(tag => tag.tag),
    }));
  } finally {
    // Close connection
    if (client) {
      client.close();
    }
  }
}

// Update a tool
export async function updateTool(
  name: string,
  updates: {
    description?: string;
    inputSchema?: string;
    outputSchema?: string;
    category?: string;
    tags?: string[];
  }
) {
  const { db, client } = getDb();
  
  try {
    // Check if tool exists
    const existingTool = await getToolByName(name);
    if (!existingTool) {
      throw new Error(`Tool with name ${name} not found`);
    }
    
    // Update tool
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (updates.description) updateData.description = updates.description;
    if (updates.inputSchema) updateData.inputSchema = updates.inputSchema;
    if (updates.outputSchema !== undefined) updateData.outputSchema = updates.outputSchema;
    if (updates.category !== undefined) updateData.category = updates.category;
    
    await db
      .update(tool)
      .set(updateData)
      .where(eq(tool.name, name));
    
    // Update tags if provided
    if (updates.tags) {
      // Remove existing tags
      await db
        .delete(toolTag)
        .where(eq(toolTag.toolName, name));
      
      // Add new tags
      if (updates.tags.length > 0) {
        const tagValues = updates.tags.map(tag => ({
          toolName: name,
          tag
        }));
        
        await db.insert(toolTag).values(tagValues);
      }
    }
    
    // Update embedding if relevant fields were updated
    if (updates.description || updates.inputSchema || updates.outputSchema || 
        updates.category || updates.tags) {
      
      try {
        // Get updated tool data
        const updatedTool = await db
          .select()
          .from(tool)
          .where(eq(tool.name, name))
          .then(results => results[0]);
          
        // Get tags for the tool
        const tags = await db
          .select()
          .from(toolTag)
          .where(eq(toolTag.toolName, name));
        
        if (updatedTool) {
          // Generate text for embedding
          const toolText = `${updatedTool.name} ${updatedTool.description} ${updatedTool.inputSchema} ${updatedTool.outputSchema || ''} ${updatedTool.category || ''}`;
          const tagsText = tags.map(tag => tag.tag).join(' ');
          const fullText = `${toolText} ${tagsText}`;
          
          // Generate new embedding
          const embedding = await getEmbedding(fullText);
          
          // Store embedding in F32_BLOB column
          await storeEmbedding(client, name, embedding);
        }
      } catch (error) {
        console.error(`Error updating embeddings for tool ${name}:`, error);
        // Continue without embeddings if there's an error
      }
    }
    
    return { success: true };
  } finally {
    // Close connection
    if (client) {
      client.close();
    }
  }
}

// Delete a tool
export async function deleteTool(name: string) {
  const { db, client } = getDb();
  
  try {
    // Delete tool (cascade will delete tags and embeddings through foreign keys)
    await db
      .delete(tool)
      .where(eq(tool.name, name));
    
    return { success: true };
  } finally {
    // Close connection
    if (client) {
      client.close();
    }
  }
}

/**
 * Generate or update embeddings for all tools in the database
 * This is useful for batch updating all embeddings
 */
export async function updateAllToolEmbeddings() {
  const { db, client } = getDb();
  
  let updated = 0;
  let errors = 0;
  
  try {
    // Get all tools
    const tools = await db.select().from(tool);
    
    // Process each tool
    for (const t of tools) {
      try {
        // Generate text for embedding
        const toolText = `${t.name} ${t.description} ${t.inputSchema} ${t.outputSchema || ''} ${t.category || ''}`;
        
        // Get tags for the tool
        const tags = await db
          .select()
          .from(toolTag)
          .where(eq(toolTag.toolName, t.name));
        
        // Add tags to the text
        const tagsText = tags.map(tag => tag.tag).join(' ');
        const fullText = `${toolText} ${tagsText}`;
        
        // Generate embedding with the configured provider
        const embedding = await getEmbedding(fullText);
        
        // Store embedding in F32_BLOB column
        await storeEmbedding(client, t.name, embedding);
        
        updated++;
      } catch (error) {
        console.error(`Error updating embedding for tool ${t.name}:`, error);
        errors++;
      }
    }
    
    return { 
      success: true, 
      updated,
      errors,
      total: updated + errors
    };
  } finally {
    // Close connection
    if (client) {
      client.close();
    }
  }
}

// Helper function for OR conditions
function or(...conditions: SQL<unknown>[]): SQL<unknown> {
  return sql.raw(conditions.map(c => `(${c})`).join(' OR '));
}