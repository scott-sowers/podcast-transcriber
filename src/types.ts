export type Episode = {
  id: string;
  title: string;
  audioUrl: string;
  publishedAt?: string;
  link?: string;
};

export type TranscriptRecord = {
  episodeId: string;
  title: string;
  audioUrl: string;
  podcastSlug: string;
  sourceFeed: string;
  createdAt: string;
  publishedAt?: string;
  link?: string;
  deepgram: {
    model?: string;
    language?: string;
    duration?: number;
    raw: unknown;
  };
  transcriptText: string;
};

export type TranscriptIndexEntry = {
  key: string;
  episodeId: string;
  title: string;
  audioUrl: string;
  podcastSlug: string;
  sourceFeed: string;
  transcriptPath: string;
  publishedAt?: string;
  link?: string;
  transcribedAt: string;
  contentHash: string;
  deepgram?: {
    model?: string;
    language?: string;
    duration?: number;
    raw?: unknown;
  };
};

export type TranscriptDbRow = {
  id: number;
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
  chroma_collection: string | null;
  chroma_document_id: string | null;
  chroma_synced_at: string | null;
  chroma_last_content_hash: string | null;
  chroma_sync_error: string | null;
};
