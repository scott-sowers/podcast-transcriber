import { getConfig } from "./config.js";
import { GithubStore } from "./github-store.js";
import { fetchEpisodes } from "./rss.js";
import { SupabaseStore } from "./supabase-store.js";
import { transcribeWithDeepgram } from "./transcribe.js";
import { Episode, TranscriptIndexEntry } from "./types.js";
import { getEpisodeFileSlug, getPodcastSlug, shortHash } from "./utils.js";

type SyncOptions = {
  feedUrl: string;
  dryRun?: boolean;
  limit?: number;
  order?: "newest" | "oldest";
};

type EpisodeOptions = {
  feedUrl: string;
  episodeSelector: string;
  dryRun?: boolean;
};

function getEpisodePath(basePath: string, podcastSlug: string, episode: Episode): string {
  const episodeSlug = getEpisodeFileSlug(episode.id, episode.title);
  return `${basePath}/${podcastSlug}/${episodeSlug}.md`;
}

function getEpisodeKey(podcastSlug: string, episodeId: string): string {
  return `${podcastSlug}::${episodeId}`;
}

function episodeTimestamp(episode: Episode): number {
  if (!episode.publishedAt) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(episode.publishedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function renderTranscriptMarkdown(entry: TranscriptIndexEntry, transcriptText: string): string {
  const lines = [
    `# ${entry.title}`,
    "",
    `- Episode ID: ${entry.episodeId}`,
    `- Podcast: ${entry.podcastSlug}`,
    `- Published: ${entry.publishedAt || "unknown"}`,
    `- Link: ${entry.link || ""}`,
    `- Audio URL: ${entry.audioUrl}`,
    `- Source Feed: ${entry.sourceFeed}`,
    `- Transcribed At: ${entry.transcribedAt}`,
    "",
    "## Transcript",
    "",
    transcriptText.trim()
  ];

  return lines.join("\n").trimEnd() + "\n";
}

function findEpisode(episodes: Episode[], selector: string): Episode {
  const normalized = selector.toLowerCase();
  const matches = episodes.filter(
    (episode) =>
      episode.id === selector ||
      episode.link === selector ||
      episode.title.toLowerCase().includes(normalized)
  );

  if (matches.length === 0) {
    throw new Error(`No episode matched selector: ${selector}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Selector matched ${matches.length} episodes. Use exact GUID or episode link for disambiguation.`
    );
  }

  return matches[0];
}

export async function syncUntranscribedEpisodes(options: SyncOptions): Promise<void> {
  const config = getConfig();
  const podcastSlug = getPodcastSlug(options.feedUrl);

  const github = new GithubStore(
    config.GITHUB_TOKEN,
    config.GITHUB_OWNER,
    config.GITHUB_REPO,
    config.GITHUB_BRANCH
  );
  const supabase = new SupabaseStore(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY);

  const episodes = await fetchEpisodes(options.feedUrl);

  const orderedEpisodes = episodes
    .slice()
    .sort((a, b) =>
      options.order === "oldest"
        ? episodeTimestamp(a) - episodeTimestamp(b)
        : episodeTimestamp(b) - episodeTimestamp(a)
    );

  const existingEpisodeIds = await supabase.getExistingEpisodeIdsByPodcastSlug(podcastSlug);

  const untranscribedEpisodes = orderedEpisodes.filter((episode) => {
    return !existingEpisodeIds.has(episode.id);
  });
  let queued = untranscribedEpisodes;

  if (options.limit && options.limit > 0) {
    queued = queued.slice(0, options.limit);
  }

  console.log(`Feed episodes: ${episodes.length}`);
  console.log(`Already transcribed: ${episodes.length - untranscribedEpisodes.length}`);
  console.log(`Untranscribed available: ${untranscribedEpisodes.length}`);
  console.log(`To transcribe this run: ${queued.length}`);

  const failures: { title: string; episodeId: string; audioUrl: string; reason: string }[] = [];

  for (const episode of queued) {
    const key = getEpisodeKey(podcastSlug, episode.id);
    const transcriptPath = getEpisodePath(config.TRANSCRIPT_BASE_PATH, podcastSlug, episode);
    console.log(`- ${episode.title}`);

    if (options.dryRun) {
      console.log(`  [dry-run] would write ${transcriptPath}`);
      continue;
    }

    try {
      const transcript = await transcribeWithDeepgram(
        config.DEEPGRAM_API_KEY,
        episode,
        options.feedUrl,
        podcastSlug
      );

      const entry: TranscriptIndexEntry = {
        key,
        episodeId: episode.id,
        title: episode.title,
        audioUrl: episode.audioUrl,
        podcastSlug,
        sourceFeed: options.feedUrl,
        transcriptPath,
        publishedAt: episode.publishedAt,
        link: episode.link,
        transcribedAt: transcript.createdAt,
        contentHash: shortHash(transcript.transcriptText),
        deepgram: {
          model: transcript.deepgram.model,
          language: transcript.deepgram.language,
          duration: transcript.deepgram.duration,
          raw: transcript.deepgram.raw
        }
      };

      const markdown = renderTranscriptMarkdown(entry, transcript.transcriptText);
      await github.upsertText(transcriptPath, markdown, `Add transcript: ${episode.title}`);
      await supabase.upsertTranscript(entry);

      console.log(`  saved ${transcriptPath}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ failed: ${reason}`);
      console.error(`    audioUrl: ${episode.audioUrl}`);
      console.error(`    episodeId: ${episode.id}`);
      failures.push({ title: episode.title, episodeId: episode.id, audioUrl: episode.audioUrl, reason });
    }
  }

  const succeeded = queued.length - failures.length;
  console.log(`\nDone. Succeeded: ${succeeded}/${queued.length}. Failed: ${failures.length}.`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) {
      console.log(`  - ${f.title} (${f.episodeId}): ${f.reason}`);
    }
    process.exitCode = 1;
  }
}

export async function transcribeSingleEpisode(options: EpisodeOptions): Promise<void> {
  const config = getConfig();
  const podcastSlug = getPodcastSlug(options.feedUrl);

  const github = new GithubStore(
    config.GITHUB_TOKEN,
    config.GITHUB_OWNER,
    config.GITHUB_REPO,
    config.GITHUB_BRANCH
  );
  const supabase = new SupabaseStore(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY);

  const episodes = await fetchEpisodes(options.feedUrl);
  const episode = findEpisode(episodes, options.episodeSelector);
  const key = getEpisodeKey(podcastSlug, episode.id);
  const exists = await supabase.hasTranscript(podcastSlug, episode.id);

  if (exists) {
    console.log(`Episode already transcribed: ${episode.title}`);
    return;
  }

  const transcriptPath = getEpisodePath(config.TRANSCRIPT_BASE_PATH, podcastSlug, episode);
  console.log(`Transcribing: ${episode.title}`);

  if (options.dryRun) {
    console.log(`[dry-run] would write ${transcriptPath}`);
    return;
  }

  const transcript = await transcribeWithDeepgram(
    config.DEEPGRAM_API_KEY,
    episode,
    options.feedUrl,
    podcastSlug
  );

  const entry: TranscriptIndexEntry = {
    key,
    episodeId: episode.id,
    title: episode.title,
    audioUrl: episode.audioUrl,
    podcastSlug,
    sourceFeed: options.feedUrl,
    transcriptPath,
    publishedAt: episode.publishedAt,
    link: episode.link,
    transcribedAt: transcript.createdAt,
    contentHash: shortHash(transcript.transcriptText),
    deepgram: {
      model: transcript.deepgram.model,
      language: transcript.deepgram.language,
      duration: transcript.deepgram.duration,
      raw: transcript.deepgram.raw
    }
  };

  const markdown = renderTranscriptMarkdown(entry, transcript.transcriptText);
  await github.upsertText(transcriptPath, markdown, `Add transcript: ${episode.title}`);
  await supabase.upsertTranscript(entry);

  console.log(`Saved: ${transcriptPath}`);
}
