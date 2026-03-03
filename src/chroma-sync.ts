import { ChromaStore } from "./chroma-store.js";
import { getConfig } from "./config.js";
import { GithubStore } from "./github-store.js";
import { SupabaseStore } from "./supabase-store.js";
import { TranscriptDbRow } from "./types.js";

function parseFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasBooleanFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireChromaConfig(config: ReturnType<typeof getConfig>): {
  apiKey: string;
  tenant: string;
  database: string;
} {
  if (!config.CHROMA_API_KEY) {
    throw new Error("Missing CHROMA_API_KEY");
  }
  if (!config.CHROMA_TENANT) {
    throw new Error("Missing CHROMA_TENANT");
  }
  if (!config.CHROMA_DATABASE) {
    throw new Error("Missing CHROMA_DATABASE");
  }

  return {
    apiKey: config.CHROMA_API_KEY,
    tenant: config.CHROMA_TENANT,
    database: config.CHROMA_DATABASE
  };
}

async function loadEmbeddingFunction(): Promise<unknown> {
  try {
    const mod = await import("@chroma-core/openai");
    const ctor = (mod as {
      OpenAIEmbeddingFunction?: new (options: {
        apiKeyEnvVar?: string;
        modelName?: string;
      }) => unknown;
    }).OpenAIEmbeddingFunction;

    if (!ctor) {
      throw new Error("OpenAIEmbeddingFunction export not found");
    }

    return new ctor({
      apiKeyEnvVar: "OPENAI_API_KEY",
      modelName: "text-embedding-3-small"
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Unable to load OpenAI embedding function. Install with: pnpm add @chroma-core/openai. " +
        `Underlying error: ${message}`
    );
  }
}

function metadataForRow(row: TranscriptDbRow): Record<string, string | number | boolean> {
  return {
    source: "podcast-transcriber",
    key: row.key,
    episode_id: row.episode_id,
    title: row.title,
    podcast_slug: row.podcast_slug,
    source_feed: row.source_feed,
    transcript_path: row.transcript_path,
    audio_url: row.audio_url,
    published_at: row.published_at ?? "",
    transcribed_at: row.transcribed_at,
    content_hash: row.content_hash
  };
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function splitOversizedText(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = text.length;
    let found = false;

    while (end > start) {
      const candidate = text.slice(start, end);
      if (byteLength(candidate) <= maxBytes) {
        chunks.push(candidate);
        start = end;
        found = true;
        break;
      }
      end -= 1;
    }

    if (!found) {
      throw new Error(`Unable to chunk text within maxBytes=${maxBytes}`);
    }
  }

  return chunks;
}

function chunkTranscript(markdown: string, maxBytes: number): string[] {
  if (byteLength(markdown) <= maxBytes) {
    return [markdown];
  }

  const paragraphs = markdown.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (byteLength(candidate) <= maxBytes) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (byteLength(paragraph) <= maxBytes) {
      current = paragraph;
    } else {
      const split = splitOversizedText(paragraph, maxBytes);
      chunks.push(...split);
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function main(): Promise<void> {
  const config = getConfig();
  const chromaConfig = requireChromaConfig(config);
  const embeddingFunction = await loadEmbeddingFunction();

  const collection = parseFlag("collection") || "podcast-transcripts";
  const limitFlag = parseFlag("limit");
  const limit = limitFlag ? Number(limitFlag) : 100;
  const maxBytesFlag = parseFlag("max-bytes");
  const maxBytes = maxBytesFlag ? Number(maxBytesFlag) : 12000;
  if (!Number.isFinite(maxBytes) || maxBytes < 1000) {
    throw new Error("Invalid --max-bytes value. Use an integer >= 1000.");
  }
  const podcastSlug = parseFlag("podcast");
  const dryRun = hasBooleanFlag("dry-run");

  const supabase = new SupabaseStore(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY);
  const github = new GithubStore(
    config.GITHUB_TOKEN,
    config.GITHUB_OWNER,
    config.GITHUB_REPO,
    config.GITHUB_BRANCH
  );
  const chroma = new ChromaStore(
    chromaConfig.apiKey,
    collection,
    chromaConfig.tenant,
    chromaConfig.database,
    embeddingFunction
  );

  const pending = await supabase.getTranscriptsPendingChromaSync({
    limit,
    podcastSlug
  });

  console.log(`Pending Chroma sync: ${pending.length}`);
  let synced = 0;
  let failed = 0;

  for (const row of pending) {
    console.log(`- ${row.title}`);

    const transcriptMarkdown = await github.getText(row.transcript_path);
    if (!transcriptMarkdown) {
      const message = `Transcript file missing in GitHub: ${row.transcript_path}`;
      failed += 1;
      if (!dryRun) {
        await supabase.markChromaSyncError(row.id, message);
      }
      console.error(`  ${message}`);
      continue;
    }

    const baseDocumentId = row.chroma_document_id || row.key;
    const metadata = metadataForRow(row);
    const chunked = chunkTranscript(transcriptMarkdown, maxBytes);
    const ids = chunked.map((_, index) => `${baseDocumentId}::chunk:${index + 1}`);
    const metadatas = chunked.map((_, index) => ({
      ...metadata,
      chunk_index: index + 1,
      chunk_count: chunked.length,
      is_chunked: chunked.length > 1
    }));

    if (dryRun) {
      console.log(
        `  [dry-run] would upsert ${chunked.length} doc(s) for ${baseDocumentId} into ${collection}`
      );
      continue;
    }

    try {
      await chroma.deleteByEpisodeKey(row.key);
      await chroma.upsertDocuments(ids, chunked, metadatas);
      await supabase.markChromaSynced(row.id, {
        chromaCollection: collection,
        chromaDocumentId: baseDocumentId,
        contentHash: row.content_hash
      });
      synced += 1;
      console.log(`  synced ${baseDocumentId} (${chunked.length} chunk(s))`);
    } catch (error: unknown) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await supabase.markChromaSyncError(row.id, message);
      console.error(`  failed: ${message}`);
    }
  }

  console.log(`Sync complete. Synced: ${synced}, Failed: ${failed}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
