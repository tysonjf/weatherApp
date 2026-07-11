import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { cooks, notes, readings } from "@/db/schema";
import { publicProcedure, router } from "./trpc";

const now = () => Date.now() / 1000;

/** Chart points: bucket-averaged so an 8 h cook is ~500 points, not ~6000. */
export type SeriesPoint = {
  ts: number;
  probe1Internal: number | null;
  probe1Ambient: number | null;
  probe2Internal: number | null;
  probe2Ambient: number | null;
};

export const appRouter = router({
  live: publicProcedure.query(async ({ ctx }) => {
    const [latest] = await ctx.db.select().from(readings).orderBy(desc(readings.ts)).limit(1);
    return { latest: latest ?? null, staleSeconds: latest ? Math.round(now() - latest.ts) : null };
  }),

  cooks: router({
    list: publicProcedure.query(({ ctx }) =>
      ctx.db.select().from(cooks).orderBy(desc(cooks.startedAt)),
    ),

    get: publicProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
      const [cook] = await ctx.db.select().from(cooks).where(eq(cooks.id, input.id));
      if (!cook) throw new TRPCError({ code: "NOT_FOUND" });
      return cook;
    }),

    start: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          meatType: z.string().max(100).optional(),
          targetInternalC: z.number().min(0).max(150).optional(),
          probe: z.number().int().min(1).max(2).default(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [active] = await ctx.db.select().from(cooks).where(isNull(cooks.endedAt)).limit(1);
        if (active) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `"${active.name}" is still running — end it first`,
          });
        }
        const [cook] = await ctx.db
          .insert(cooks)
          .values({ ...input, startedAt: now() })
          .returning();
        return cook;
      }),

    end: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const [cook] = await ctx.db
          .update(cooks)
          .set({ endedAt: now() })
          .where(and(eq(cooks.id, input.id), isNull(cooks.endedAt)))
          .returning();
        return cook ?? null;
      }),
  }),

  readings: router({
    /** Downsampled temperature series for one cook's time window. */
    series: publicProcedure
      .input(z.object({ cookId: z.number().int(), maxPoints: z.number().int().min(50).max(2000).default(500) }))
      .query(async ({ ctx, input }) => {
        const [cook] = await ctx.db.select().from(cooks).where(eq(cooks.id, input.cookId));
        if (!cook) throw new TRPCError({ code: "NOT_FOUND" });
        const end = cook.endedAt ?? now();
        const bucket = Math.max(5, Math.ceil((end - cook.startedAt) / input.maxPoints));
        const t = sql<number>`cast(${readings.ts} / ${bucket} as integer) * ${bucket}`;
        const points: SeriesPoint[] = await ctx.db
          .select({
            ts: t,
            probe1Internal: sql<number | null>`avg(${readings.probe1Internal})`,
            probe1Ambient: sql<number | null>`avg(${readings.probe1Ambient})`,
            probe2Internal: sql<number | null>`avg(${readings.probe2Internal})`,
            probe2Ambient: sql<number | null>`avg(${readings.probe2Ambient})`,
          })
          .from(readings)
          .where(and(gte(readings.ts, cook.startedAt), lte(readings.ts, end)))
          .groupBy(t)
          .orderBy(t);
        return { cook, points, bucketSeconds: bucket };
      }),
  }),

  notes: router({
    list: publicProcedure
      .input(z.object({ cookId: z.number().int() }))
      .query(({ ctx, input }) =>
        ctx.db.select().from(notes).where(eq(notes.cookId, input.cookId)).orderBy(notes.ts),
      ),

    add: publicProcedure
      .input(
        z.object({
          cookId: z.number().int(),
          ts: z.number(), // where on the graph the comment sits
          text: z.string().min(1).max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [note] = await ctx.db.insert(notes).values(input).returning();
        return note;
      }),

    remove: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => ctx.db.delete(notes).where(eq(notes.id, input.id))),
  }),
});

export type AppRouter = typeof appRouter;
