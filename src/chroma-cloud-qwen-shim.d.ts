declare module "@chroma-core/chroma-cloud-qwen" {
  export enum ChromaCloudQwenEmbeddingModel {
    QWEN3_EMBEDDING_0p6B = "Qwen/Qwen3-Embedding-0.6B"
  }

  export class ChromaCloudQwenEmbeddingFunction {
    constructor(options: {
      model: ChromaCloudQwenEmbeddingModel;
      task: string | null;
      apiKeyEnvVar?: string;
    });
  }
}
