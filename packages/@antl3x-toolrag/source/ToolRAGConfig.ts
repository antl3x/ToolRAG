import { z } from 'zod';
import { EmbeddingProviderOpenAI } from './EmbeddingProviderOpenAI';
import { EmbeddingProviderGoogle } from './EmbeddingProviderGoogle';

const ToolRAGConfigSchema = z.object({
  embeddingProvider: z
    .union([
      z.literal('openai'),
      z.literal('google'),
      z.instanceof(EmbeddingProviderOpenAI),
      z.instanceof(EmbeddingProviderGoogle),
    ])
    .default('openai'),
  mcpServers: z.array(z.string()).default([]),
  rerank: z
    .object({
      enabled: z.boolean().optional(),
      threshold: z.number().optional(),
    })
    .optional(),
  database: z
    .object({
      url: z.string().default('file:./toolreg.db'),
    })
    .default({}),
});

// Create a type for the input config (where fields can be omitted)
type ToolRAGConfigInput = z.input<typeof ToolRAGConfigSchema>;
// Create a type for the output config (where fields are required with defaults)
type ToolRAGConfig = z.output<typeof ToolRAGConfigSchema>;

class ConfigManager {
  private static instance: ConfigManager;
  private config: ToolRAGConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public setup(config: ToolRAGConfigInput): ToolRAGConfig {
    try {
      this.config = ToolRAGConfigSchema.parse(config);
      return this.config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid configuration: ${error.message}`);
      }
      throw error;
    }
  }

  public getConfig(): ToolRAGConfig {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call setup() first.');
    }
    return this.config;
  }
}

const setupConfig = (config: ToolRAGConfigInput | undefined): ToolRAGConfig => {
  return ConfigManager.getInstance().setup(config ?? {});
};

const getConfig = (): ToolRAGConfig => {
  return ConfigManager.getInstance().getConfig();
};

export { setupConfig, getConfig, type ToolRAGConfig, type ToolRAGConfigInput };
