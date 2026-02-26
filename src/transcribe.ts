import { createClient } from "@deepgram/sdk";
import { Episode, TranscriptRecord } from "./types.js";

export async function transcribeWithDeepgram(
  deepgramApiKey: string,
  episode: Episode,
  feedUrl: string,
  podcastSlug: string
): Promise<TranscriptRecord> {
  const deepgram = createClient(deepgramApiKey);

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
    throw new Error(`Deepgram error: ${error.message}`);
  }

  const transcriptText =
    result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

  const modelInfo = result.metadata?.model_info;
  const model = typeof modelInfo === "string" ? modelInfo : undefined;

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
}
