declare module "@chroma-core/openai" {
  export class OpenAIEmbeddingFunction {
    constructor(options: {
      apiKeyEnvVar?: string;
      modelName?: string;
      apiBase?: string;
    });
  }
}
