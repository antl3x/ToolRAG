import OpenAI from 'openai';
import { EmbeddingProvider } from './EmbeddingProvider.js';
import { z } from 'zod';

const EmbeddingProviderOpenAIConfigSchema = z
  .object({
    model: z
      .enum(['text-embedding-3-small', 'text-embedding-3-large'])
      .default('text-embedding-3-large'),
    client: z.instanceof(OpenAI).optional(),
  })
  .default({});

type EmbeddingProviderOpenAIConfig = z.infer<typeof EmbeddingProviderOpenAIConfigSchema>;

/**
 * OpenAI implementation of the EmbeddingProvider
 */
export class EmbeddingProviderOpenAI implements EmbeddingProvider {
  private _client: OpenAI;
  private _dimensions: number;
  private _config: EmbeddingProviderOpenAIConfig;

  constructor(config?: EmbeddingProviderOpenAIConfig) {
    this._config = EmbeddingProviderOpenAIConfigSchema.parse(config);
    this._client = this._config.client || new OpenAI();

    // Default dimensions based on model
    this._dimensions =
      this._config.model === 'text-embedding-3-small'
        ? 1536
        : this._config.model === 'text-embedding-3-large'
          ? 3072
          : 1536; // Default fallback
  }

  async getEmbedding(text: string): Promise<number[]> {
    const response = await this._client.embeddings.create({
      model: this._config.model,
      input: text,
      dimensions: this._dimensions,
    });

    return response.data[0].embedding;
  }

  getDimensions(): number {
    return this._dimensions;
  }

  getName(): string {
    return `openai`;
  }

  getModel(): string {
    return this._config.model;
  }
}
