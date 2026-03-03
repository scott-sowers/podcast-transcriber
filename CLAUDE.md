# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript CLI that transcribes podcast episodes from RSS feeds using Deepgram, stores markdown transcripts in a GitHub repo, indexes metadata in Supabase, and optionally syncs to Chroma Cloud for vector search.

## Commands

```bash
pnpm install                # Install dependencies
pnpm build                  # Compile TypeScript to dist/
pnpm check                  # Type-check without emitting (use this to verify changes)
pnpm sync -- --feed <url> [--limit N] [--order newest|oldest] [--dry-run]
pnpm episode -- --feed <url> --selector <guid|link|title> [--dry-run]
pnpm sync:chroma -- --collection <name> [--podcast <slug>] [--limit N] [--max-bytes 12000]
```

There are no tests or linting configured.

## Architecture

**Data flow:** RSS Feed → Deepgram transcription → GitHub markdown file → Supabase metadata row → (optional) Chroma vector DB

Key modules in `src/`:
- **cli.ts** — Entry point. Hand-rolled flag parsing, dispatches to `app.ts` functions.
- **app.ts** — Core orchestration: `syncUntranscribedEpisodes()` and `transcribeSingleEpisode()`. Composes all other modules.
- **config.ts** — Loads `.env` with dotenv, validates with Zod schema. All env vars accessed via `getConfig()`.
- **rss.ts** — Parses RSS feeds with `fast-xml-parser`, extracts `Episode` objects.
- **transcribe.ts** — Calls Deepgram SDK (nova-2 model, smart formatting, diarization).
- **github-store.ts** — Octokit wrapper for file CRUD (upsert, read, list) against a target repo.
- **supabase-store.ts** — Supabase client for the `public.podcast_transcripts` table (upsert, query, pagination).
- **chroma-sync.ts** — Separate entry point (`pnpm sync:chroma`). Reads pending transcripts from Supabase, fetches markdown from GitHub, chunks by byte size respecting paragraph boundaries, upserts to Chroma Cloud.
- **chroma-store.ts** — Chroma Cloud client wrapper with lazy collection init, uses OpenAI embeddings (`text-embedding-3-small`).
- **types.ts** — `Episode` and `TranscriptIndexEntry` type definitions.
- **utils.ts** — `safeSlug()`, `shortHash()` (16-char SHA256), `getPodcastSlug()`, `getEpisodeFileSlug()`.

## Key Conventions

- **ESM project** (`"type": "module"` in package.json). All local imports use `.js` extension (e.g., `./config.js`).
- **Strict TypeScript** with ES2022 target and NodeNext module resolution.
- **Package manager**: pnpm (lockfile: `pnpm-lock.yaml`).
- **Node.js 20+** required.
- **Deduplication key**: `{podcastSlug}::{episodeId}` stored in Supabase with unique constraints.
- **Content hashing**: 16-char SHA256 hash tracks transcript changes for Chroma re-sync.
- **Transcript path pattern**: `{TRANSCRIPT_BASE_PATH}/{podcastSlug}/{episodeSlug}.md`
- Type shim files (`chromadb-shim.d.ts`, `openai-shim.d.ts`) provide declarations for untyped Chroma packages.

## Environment

Copy `.env.example` to `.env`. Required: `DEEPGRAM_API_KEY`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Optional: `GITHUB_BRANCH`, `TRANSCRIPT_BASE_PATH`, `OPENAI_API_KEY` (for Chroma embeddings), `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`.
