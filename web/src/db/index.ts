import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema });
}

export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

export type Db = Awaited<ReturnType<typeof getDb>>;
