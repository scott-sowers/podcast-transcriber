declare module "chromadb" {
  export class CloudClient {
    constructor(options: {
      apiKey: string;
      tenant?: string;
      database?: string;
    });

    getOrCreateCollection(options: {
      name: string;
      embeddingFunction?: unknown;
    }): Promise<{
      delete(args: {
        where?: Record<string, string | number | boolean>;
      }): Promise<void>;
      upsert(args: {
        ids: string[];
        documents: string[];
        metadatas?: Record<string, string | number | boolean>[];
      }): Promise<void>;
    }>;
  }
}
