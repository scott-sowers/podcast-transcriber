import { CloudClient } from "chromadb";

type ChromaMetadata = Record<string, string | number | boolean>;

type ChromaCollection = {
  delete(args: { where?: ChromaMetadata }): Promise<void>;
  upsert(args: { ids: string[]; documents: string[]; metadatas?: ChromaMetadata[] }): Promise<void>;
};

export class ChromaStore {
  private client: CloudClient;
  private collectionPromise?: Promise<ChromaCollection>;

  constructor(
    apiKey: string,
    private collectionName: string,
    tenant: string,
    database: string,
    private embeddingFunction?: unknown
  ) {
    this.client = new CloudClient({
      apiKey,
      tenant,
      database
    });
  }

  private async getCollection(): Promise<ChromaCollection> {
    if (!this.collectionPromise) {
      this.collectionPromise = this.client.getOrCreateCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingFunction
      }) as Promise<ChromaCollection>;
    }

    return this.collectionPromise;
  }

  async upsertDocument(
    documentId: string,
    document: string,
    metadata: ChromaMetadata
  ): Promise<void> {
    await this.upsertDocuments([documentId], [document], [metadata]);
  }

  async upsertDocuments(
    ids: string[],
    documents: string[],
    metadatas: ChromaMetadata[]
  ): Promise<void> {
    const collection = await this.getCollection();
    await collection.upsert({
      ids,
      documents,
      metadatas
    });
  }

  async deleteByEpisodeKey(episodeKey: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.delete({
      where: { key: episodeKey }
    });
  }
}
