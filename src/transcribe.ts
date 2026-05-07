import { createClient } from "@deepgram/sdk";
import { Episode, TranscriptRecord } from "./types.js";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000;

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const parts = [err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message];
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      const code = (cause as { code?: string }).code;
      parts.push(`cause: ${code ? `[${code}] ` : ""}${cause.message}`);
    } else if (cause) {
      parts.push(`cause: ${String(cause)}`);
    }
    return parts.join(" — ");
  }
  return String(err);
}

function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("fetch failed") || msg.includes("timeout") || msg.includes("etimedout")) {
    return true;
  }
  const cause = (err as { cause?: unknown }).cause;
  const code = cause instanceof Error ? (cause as { code?: string }).code : undefined;
  if (code && ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return true;
  }
  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function transcribeWithDeepgram(
  deepgramApiKey: string,
  episode: Episode,
  feedUrl: string,
  podcastSlug: string
): Promise<TranscriptRecord> {
  const deepgram = createClient(deepgramApiKey);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
        { url: episode.audioUrl },
        {
          model: "nova-2",
          smart_format: true,
          punctuate: true,
          diarize: true
        }
      );

      if (error) {
        throw new Error(`Deepgram API error: ${error.message}`);
      }

      const transcriptText =
        result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

      const modelInfo = result.metadata?.model_info;
      const model = typeof modelInfo === "string" ? modelInfo : undefined;

      if (attempt > 1) {
        console.log(`  recovered on attempt ${attempt}`);
      }

      return {
        episodeId: episode.id,
        title: episode.title,
        audioUrl: episode.audioUrl,
        podcastSlug,
        sourceFeed: feedUrl,
        publishedAt: episode.publishedAt,
        link: episode.link,
        createdAt: new Date().toISOString(),
        deepgram: {
          model,
          language: result.results?.channels?.[0]?.detected_language,
          duration: result.metadata?.duration,
          raw: result
        },
        transcriptText
      };
    } catch (err) {
      lastError = err;
      const transient = isTransient(err);
      const detail = describeError(err);
      if (attempt < MAX_ATTEMPTS && transient) {
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(`  attempt ${attempt}/${MAX_ATTEMPTS} failed: ${detail}`);
        console.warn(`  retrying in ${delay}ms…`);
        await sleep(delay);
        continue;
      }
      throw new Error(`Deepgram transcription failed after ${attempt} attempt(s): ${detail}`, {
        cause: err instanceof Error ? err : undefined
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Deepgram transcription failed");
}
