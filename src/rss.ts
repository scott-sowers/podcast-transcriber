import { XMLParser } from "fast-xml-parser";
import { Episode } from "./types.js";
import { shortHash } from "./utils.js";

type RssItem = {
  guid?: string | { "#text"?: string };
  title?: string;
  pubDate?: string;
  link?: string;
  enclosure?: { "@_url"?: string; "@_type"?: string };
};

function normalizeGuid(guid: RssItem["guid"]): string | undefined {
  if (!guid) return undefined;
  if (typeof guid === "string") return guid;
  return guid["#text"];
}

export async function fetchEpisodes(feedUrl: string): Promise<Episode[]> {
  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed (${response.status})`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: RssItem | RssItem[] } };
  };

  const channelItems = parsed.rss?.channel?.item;
  const items = Array.isArray(channelItems)
    ? channelItems
    : channelItems
      ? [channelItems]
      : [];

  const episodes: Episode[] = [];

  for (const item of items) {
    const title = (item.title || "Untitled Episode").trim();
    const audioUrl = item.enclosure?.["@_url"];
    if (!audioUrl) {
      continue;
    }

    const guid = normalizeGuid(item.guid);
    const id = guid || item.link || audioUrl || shortHash(title);

    episodes.push({
      id,
      title,
      audioUrl,
      publishedAt: item.pubDate,
      link: item.link
    });
  }

  return episodes;
}
