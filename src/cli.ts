import { syncUntranscribedEpisodes, transcribeSingleEpisode } from "./app.js";

function parseFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasBooleanFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireFlag(name: string): string {
  const value = parseFlag(name);
  if (!value) {
    throw new Error(`Missing required flag: --${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === "sync") {
    const feedUrl = requireFlag("feed");
    const limit = parseFlag("limit");
    const orderFlag = parseFlag("order");
    const order =
      orderFlag === "oldest" || orderFlag === "newest" ? orderFlag : ("newest" as const);
    if (orderFlag && orderFlag !== "oldest" && orderFlag !== "newest") {
      throw new Error("Invalid --order value. Use --order newest or --order oldest");
    }
    const dryRun = hasBooleanFlag("dry-run");

    await syncUntranscribedEpisodes({
      feedUrl,
      dryRun,
      limit: limit ? Number(limit) : undefined,
      order
    });
    return;
  }

  if (command === "episode") {
    const feedUrl = requireFlag("feed");
    const episodeSelector = requireFlag("selector");
    const dryRun = hasBooleanFlag("dry-run");

    await transcribeSingleEpisode({
      feedUrl,
      episodeSelector,
      dryRun
    });
    return;
  }

  console.log("Usage:");
  console.log("  pnpm sync -- --feed <rss-url> [--limit 10] [--order newest|oldest] [--dry-run]");
  console.log(
    "  pnpm episode -- --feed <rss-url> --selector <guid|episode-link|title-substring> [--dry-run]"
  );
  process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
