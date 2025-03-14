/**
 * Google AI embeddings client for generating vector embeddings
 * Uses the Google AI SDK to access embedding models
 */
import { google } from '@ai-sdk/google';
import { embed } from 'ai';

// Get configuration from environment variables
const EMBEDDINGS_MODEL = process.env.GOOGLE_EMBEDDINGS_MODEL || 'text-embedding-004';

/**
 * Generate embeddings for a text string using Google's embedding models
 * 
 * @param text The text to generate embeddings for
 * @returns Array of embedding values
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    // 'embedding' is a single embedding object (number[])
    const { embedding } = await embed({
      model: google.textEmbeddingModel(EMBEDDINGS_MODEL),
      value: text,
    });
    return embedding;
  } catch (error) {
    console.error('Error generating embeddings with Google AI:', error);
    throw error;
  }
}

/**
 * Calculate the dimension of the embeddings returned by the model
 * This is useful for configuring the F32_BLOB column size
 * 
 * @returns Promise<number> The embedding dimension
 */
export async function getEmbeddingDimension(): Promise<number> {
  try {
    // Generate an embedding for a simple text to determine the dimension
    const embedding = await getEmbedding("Test text for dimension calculation");
    return embedding.length;
  } catch (error) {
    console.error('Error calculating embedding dimension:', error);
    throw error;
  }
}