import crypto from "node:crypto";
import slugifyModule from "slugify";

const slugify = slugifyModule as unknown as (
  input: string,
  options?: { lower?: boolean; strict?: boolean; trim?: boolean }
) => string;

export function safeSlug(input: string): string {
  return slugify(input, { lower: true, strict: true, trim: true });
}

export function shortHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function getPodcastSlug(feedUrl: string): string {
  try {
    const url = new URL(feedUrl);
    const pathnameSlug = safeSlug(url.pathname.replace(/\//g, "-"));
    return pathnameSlug || safeSlug(url.hostname) || "podcast";
  } catch {
    return safeSlug(feedUrl) || "podcast";
  }
}

export function getEpisodeFileSlug(id: string, title: string): string {
  const titleSlug = safeSlug(title).slice(0, 80) || "episode";
  const hash = shortHash(id);
  return `${titleSlug}-${hash}`;
}
