import { createClient } from "@supabase/supabase-js";
import { TranscriptDbRow, TranscriptIndexEntry } from "./types.js";

type ExistingKeyRow = { key: string };
type ExistingEpisodeRow = { episode_id: string };

type TranscriptRow = {
  key: string;
  episode_id: string;
  title: string;
  audio_url: string;
  podcast_slug: string;
  source_feed: string;
  transcript_path: string;
  published_at: string | null;
  episode_link: string | null;
  transcribed_at: string;
  content_hash: string;
  deepgram_model: string | null;
  deepgram_language: string | null;
  deepgram_duration_seconds: number | null;
  deepgram_raw: unknown | null;
};

export class SupabaseStore {
  private client;

  constructor(url: string, secretKey: string) {
    this.client = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  private formatSupabaseError(prefix: string, error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  }): string {
    const parts = [prefix, error.message];
    if (error.code) parts.push(`code=${error.code}`);
    if (error.details) parts.push(`details=${error.details}`);
    if (error.hint) parts.push(`hint=${error.hint}`);
    return parts.join(" | ");
  }

  async getExistingKeys(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) {
      return new Set();
    }

    const { data, error } = await this.client
      .from("podcast_transcripts")
      .select("key")
      .in("key", keys);

    if (error) {
      throw new Error(this.formatSupabaseError("Supabase read error", error));
    }

    const rows = (data ?? []) as ExistingKeyRow[];
    return new Set(rows.map((row) => row.key));
  }

  async getExistingEpisodeIdsByPodcastSlug(podcastSlug: string): Promise<Set<string>> {
    const existing = new Set<string>();
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await this.client
        .from("podcast_transcripts")
        .select("episode_id")
        .eq("podcast_slug", podcastSlug)
        .range(from, to);

      if (error) {
        throw new Error(this.formatSupabaseError("Supabase read error", error));
      }

      const rows = (data ?? []) as ExistingEpisodeRow[];
      for (const row of rows) {
        existing.add(row.episode_id);
      }

      if (rows.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return existing;
  }

  async hasTranscript(podcastSlug: string, episodeId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("podcast_transcripts")
      .select("id")
      .eq("podcast_slug", podcastSlug)
      .eq("episode_id", episodeId)
      .limit(1);

    if (error) {
      throw new Error(this.formatSupabaseError("Supabase read error", error));
    }

    return (data ?? []).length > 0;
  }

  async upsertTranscript(entry: TranscriptIndexEntry): Promise<void> {
    const row: TranscriptRow = {
      key: entry.key,
      episode_id: entry.episodeId,
      title: entry.title,
      audio_url: entry.audioUrl,
      podcast_slug: entry.podcastSlug,
      source_feed: entry.sourceFeed,
      transcript_path: entry.transcriptPath,
      published_at: entry.publishedAt ?? null,
      episode_link: entry.link ?? null,
      transcribed_at: entry.transcribedAt,
      content_hash: entry.contentHash,
      deepgram_model: entry.deepgram?.model ?? null,
      deepgram_language: entry.deepgram?.language ?? null,
      deepgram_duration_seconds: entry.deepgram?.duration ?? null,
      deepgram_raw: entry.deepgram?.raw ?? null
    };

    const { error } = await this.client
      .from("podcast_transcripts")
      .upsert(row, { onConflict: "key" });

    if (error) {
      throw new Error(this.formatSupabaseError("Supabase upsert error", error));
    }
  }

  async getTranscriptsPendingChromaSync(options?: {
    limit?: number;
    podcastSlug?: string;
  }): Promise<TranscriptDbRow[]> {
    const limit = options?.limit && options.limit > 0 ? options.limit : 100;
    let query = this.client
      .from("podcast_transcripts")
      .select(
        "id,key,episode_id,title,audio_url,podcast_slug,source_feed,transcript_path,published_at,episode_link,transcribed_at,content_hash,chroma_collection,chroma_document_id,chroma_synced_at,chroma_last_content_hash,chroma_sync_error"
      )
      .order("transcribed_at", { ascending: true })
      .limit(limit * 3);

    if (options?.podcastSlug) {
      query = query.eq("podcast_slug", options.podcastSlug);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(this.formatSupabaseError("Supabase read error", error));
    }

    const rows = (data ?? []) as TranscriptDbRow[];
    const pending = rows.filter(
      (row) =>
        !row.chroma_synced_at ||
        !row.chroma_last_content_hash ||
        row.chroma_last_content_hash !== row.content_hash
    );

    return pending.slice(0, limit);
  }

  async markChromaSynced(rowId: number, values: {
    chromaCollection: string;
    chromaDocumentId: string;
    contentHash: string;
  }): Promise<void> {
    const { error } = await this.client
      .from("podcast_transcripts")
      .update({
        chroma_collection: values.chromaCollection,
        chroma_document_id: values.chromaDocumentId,
        chroma_last_content_hash: values.contentHash,
        chroma_synced_at: new Date().toISOString(),
        chroma_sync_error: null
      })
      .eq("id", rowId);

    if (error) {
      throw new Error(this.formatSupabaseError("Supabase update error", error));
    }
  }

  async markChromaSyncError(rowId: number, message: string): Promise<void> {
    const { error } = await this.client
      .from("podcast_transcripts")
      .update({
        chroma_sync_error: message.slice(0, 2000)
      })
      .eq("id", rowId);

    if (error) {
      throw new Error(this.formatSupabaseError("Supabase update error", error));
    }
  }
}
