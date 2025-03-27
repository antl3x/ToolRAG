/**
 * Base interface for all embedding providers
 */
export interface EmbeddingProvider {
  /**
   * Generate an embedding for a given text
   * @param text The text to embed
   * @returns An array of numbers representing the embedding
   */
  getEmbedding(text: string): Promise<number[]>;

  /**
   * Get the dimensionality of the embeddings
   * @returns Number of dimensions in the embedding
   */
  getDimensions(): number;

  /**
   * Get a human-readable name of the provider
   * @returns The provider name
   */
  getName(): string;

  /**
   * Get the model name for the provider
   * @returns The model name
   */
  getModel(): string;
}
