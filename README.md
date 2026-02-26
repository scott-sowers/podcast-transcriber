# Podcast Transcriber

Simple CLI app that:
1. Reads a podcast RSS feed
2. Transcribes episodes with Deepgram
3. Stores transcript files in a GitHub repo
4. Skips episodes that are already transcribed
5. Lets you transcribe one specific episode on demand

## Requirements

- Node.js 20+
- Deepgram API key
- GitHub token with `repo` scope for the target repository

## Setup

```bash
cd podcast-transcriber
pnpm install
cp .env.example .env
```

Populate `.env`:

```bash
DEEPGRAM_API_KEY=...
GITHUB_TOKEN=...
GITHUB_OWNER=your-github-org-or-user
GITHUB_REPO=your-target-repo
GITHUB_BRANCH=main
TRANSCRIPT_BASE_PATH=transcripts
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=...
CHROMA_API_KEY=...
CHROMA_TENANT=...
CHROMA_DATABASE=...
```

## Commands

Sync all un-transcribed episodes from a feed:

```bash
pnpm sync -- --feed https://example.com/podcast.rss
```

Sync only the next N un-transcribed episodes:

```bash
pnpm sync -- --feed https://example.com/podcast.rss --limit 5
```

Sync oldest-first instead of newest-first:

```bash
pnpm sync -- --feed https://example.com/podcast.rss --order oldest --limit 5
```

Transcribe one specific episode:

```bash
pnpm episode -- --feed https://example.com/podcast.rss --selector "exact-guid-or-episode-link-or-title"
```

Dry run (no writes):

```bash
pnpm sync -- --feed https://example.com/podcast.rss --dry-run
pnpm episode -- --feed https://example.com/podcast.rss --selector "..." --dry-run
```

Sync transcripts to Chroma Cloud:

```bash
pnpm sync:chroma -- --collection podcast-transcripts --limit 100
```

Sync only one podcast slug:

```bash
pnpm sync:chroma -- --collection podcast-transcripts --podcast 30mpc --limit 50
```

Control chunk size per Chroma document (bytes):

```bash
pnpm sync:chroma -- --collection podcast-transcripts --max-bytes 12000
```

## Output format

For each episode, the app writes:

- `transcripts/<podcast-slug>/<episode-slug>.md` (single canonical transcript file)

Duplicate prevention/state is stored in Supabase table `public.podcast_transcripts`, keyed by
`podcast_slug + episode_id` (and unique `key`).

## Supabase schema

The table is created via Supabase MCP migration:

- table: `public.podcast_transcripts`
- unique: `(podcast_slug, episode_id)` and `key`
- columns include transcript metadata (`transcript_path`, `content_hash`, Deepgram fields, timestamps)
- Chroma sync columns: `chroma_collection`, `chroma_document_id`, `chroma_synced_at`, `chroma_last_content_hash`, `chroma_sync_error`

## Chroma sync behavior

- Reads transcripts to sync from Supabase (`pending` = never synced or content hash changed).
- Fetches transcript markdown from GitHub path stored in `transcript_path`.
- Upserts document + metadata into the `--collection` target in Chroma Cloud.
- Automatically chunks large transcripts to stay under Chroma per-document size quotas.
- Writes sync status back to Supabase so future runs are incremental.

If you see `Embedding function must be defined for operations requiring embeddings`, install the
embedding package and rerun:

```bash
pnpm add @chroma-core/chroma-cloud-qwen
```

## Trigger.dev

This version is a direct CLI flow (simple and easy to operate via cron/GitHub Actions). If you want, I can add Trigger.dev tasks next so each episode transcription runs as a managed async job.
