/**
 * Ollama embeddings client for generating vector embeddings
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDINGS_MODEL = process.env.OLLAMA_EMBEDDINGS_MODEL || 'nomic-embed-text';

interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Generate embeddings for a text string using Ollama's embedding models
 * 
 * @param text The text to generate embeddings for
 * @returns Array of embedding values
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDINGS_MODEL,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embeddings API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as OllamaEmbeddingResponse;
    return data.embedding;
  } catch (error) {
    console.error('Error generating embeddings with Ollama:', error);
    throw error;
  }
}