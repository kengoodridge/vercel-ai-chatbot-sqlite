/**
 * Embeddings provider interface
 * This file provides a unified API for generating embeddings using different providers
 */

import * as ollamaEmbeddings from './ollama';
import * as googleEmbeddings from './google';

// The embedding provider to use, based on environment variables
// Default to Ollama if no provider is specified
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'ollama';

// These dimensions are standard for common embedding models
// They should match the F32_BLOB dimensions in the database schema
const DEFAULT_DIMENSIONS : Record<string, number> = {
  'ollama': 768,      // nomic-embed-text default size
  'google': 768,      // Gemini embeddings default size
  'openai': 1536,     // OpenAI ada-002 default size
  'default': 768      // Default fallback
};

/**
 * Get the embeddings provider based on environment configuration
 * Falls back to Ollama if the specified provider is not available
 *
 * @returns The embeddings provider object
 */
function getEmbeddingsProvider() {
  switch (EMBEDDING_PROVIDER.toLowerCase()) {
    case 'google':
      return googleEmbeddings;
    case 'ollama':
    default:
      return ollamaEmbeddings;
  }
}

/**
 * Generate embeddings for a text string using the configured provider
 *
 * @param text The text to generate embeddings for
 * @returns Array of embedding values
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const provider = getEmbeddingsProvider();
  try {
    return await provider.getEmbedding(text);
  } catch (error) {
    console.error(`Error generating embeddings with ${EMBEDDING_PROVIDER} provider:`, error);

    // If the configured provider fails and it's not Ollama, try Ollama as fallback
    if (EMBEDDING_PROVIDER.toLowerCase() !== 'ollama') {
      console.log('Falling back to Ollama embeddings provider...');
      try {
        return await ollamaEmbeddings.getEmbedding(text);
      } catch (fallbackError) {
        console.error('Fallback to Ollama embeddings also failed:', fallbackError);
        throw fallbackError;
      }
    }

    throw error;
  }
}

/**
 * Get the embedding dimension for the configured provider
 * This is used during migrations to dynamically size the F32_BLOB column
 *
 * @returns The expected embedding dimension
 */
export async function getEmbeddingDimension(): Promise<number> {
  try {
    // First try getting the actual dimension by generating a test embedding
    const testEmbedding = await getEmbedding("Test embedding for dimension calculation");
    return testEmbedding.length;
  } catch (error) {
    console.warn("Couldn't determine embedding dimension dynamically, using default:", error);

    // Fall back to known defaults by provider
    const providerName = EMBEDDING_PROVIDER.toLowerCase();
    return DEFAULT_DIMENSIONS[providerName] || DEFAULT_DIMENSIONS.default;
  }
}