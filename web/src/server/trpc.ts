import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { getDb } from "@/db";

export async function createContext() {
  return { db: await getDb() };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
