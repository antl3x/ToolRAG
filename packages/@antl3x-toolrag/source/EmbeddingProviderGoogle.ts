import { EmbeddingProvider } from './EmbeddingProvider.js';
import * as aiplatform from '@google-cloud/aiplatform';
import { z } from 'zod';

const EmbeddingProviderGoogleConfigSchema = z
  .object({
    model: z.string().default('text-embedding-005'),
    projectId: z
      .string()
      .optional()
      .refine(
        (val) => val !== undefined || process.env.GOOGLE_CLOUD_PROJECT !== undefined,
        'Google project ID is required'
      ),
    location: z.string().default('us-central1'),
    dimensions: z.number().default(768),
    taskType: z.string().default('RETRIEVAL_QUERY'),
    client: z.instanceof(aiplatform.v1.PredictionServiceClient).optional(),
  })
  .default({});

type EmbeddingProviderGoogleConfig = z.infer<typeof EmbeddingProviderGoogleConfigSchema>;

type IValue = aiplatform.protos.google.protobuf.IValue;
type IPredictRequest = aiplatform.protos.google.cloud.aiplatform.v1.IPredictRequest;

/**
 * Google implementation of the EmbeddingProvider
 */
export class EmbeddingProviderGoogle implements EmbeddingProvider {
  private _config: EmbeddingProviderGoogleConfig;
  private _client: aiplatform.v1.PredictionServiceClient;
  private _endpoint: string;

  constructor(config?: EmbeddingProviderGoogleConfig) {
    this._config = EmbeddingProviderGoogleConfigSchema.parse(config);
    this._config.projectId = this._config.projectId || process.env.GOOGLE_CLOUD_PROJECT || '';

    const clientOptions = {
      apiEndpoint: 'us-central1-aiplatform.googleapis.com',
    };

    this._client = this._config.client || new aiplatform.v1.PredictionServiceClient(clientOptions);
    this._endpoint = `projects/${this._config.projectId}/locations/${this._config.location}/publishers/google/models/${this._config.model}`;
  }

  async getEmbedding(text: string): Promise<number[]> {
    const toValueHelper = aiplatform.helpers?.toValue;
    if (!toValueHelper) {
      throw new Error('Helpers not available in Google Cloud AI Platform client');
    }

    const instances = [
      toValueHelper({
        content: text,
        task_type: this._config.taskType,
      }) as IValue,
    ];

    const parameters = toValueHelper(
      this._config.dimensions > 0 ? { outputDimensionality: this._config.dimensions } : {}
    ) as IValue;

    const request: IPredictRequest = {
      endpoint: this._endpoint,
      instances,
      parameters,
    };

    const [response] = await this._client.predict(request);
    const predictions = response.predictions;

    if (!predictions || predictions.length === 0) {
      throw new Error('No embedding returned from Google API');
    }

    const prediction = predictions[0];
    if (!prediction.structValue || !prediction.structValue.fields) {
      throw new Error('Invalid embedding response structure');
    }

    const embeddingsProto = prediction.structValue.fields.embeddings;
    if (!embeddingsProto || !embeddingsProto.structValue || !embeddingsProto.structValue.fields) {
      throw new Error('Invalid embedding response structure');
    }

    const valuesProto = embeddingsProto.structValue.fields.values;
    if (!valuesProto || !valuesProto.listValue || !valuesProto.listValue.values) {
      throw new Error('Invalid embedding response structure');
    }

    return valuesProto.listValue.values
      .map((v: any) => (typeof v.numberValue === 'number' ? v.numberValue : 0))
      .filter((v: number | null | undefined): v is number => v !== null && v !== undefined);
  }

  getDimensions(): number {
    return this._config.dimensions;
  }

  getName(): string {
    return `google`;
  }

  getModel(): string {
    return this._config.model;
  }
}
