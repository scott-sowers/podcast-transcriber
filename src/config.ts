import { config as loadDotEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadDotEnv();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotEnv({ path: path.resolve(__dirname, "..", ".env"), override: false });

const envSchema = z.object({
  DEEPGRAM_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_OWNER: z.string().min(1),
  GITHUB_REPO: z.string().min(1),
  GITHUB_BRANCH: z.string().min(1).optional(),
  TRANSCRIPT_BASE_PATH: z.string().min(1).default("transcripts"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  CHROMA_API_KEY: z.string().min(1).optional(),
  CHROMA_TENANT: z.string().min(1).optional(),
  CHROMA_DATABASE: z.string().min(1).optional()
});

export type AppConfig = z.infer<typeof envSchema>;

export function getConfig(): AppConfig {
  return envSchema.parse(process.env);
}
