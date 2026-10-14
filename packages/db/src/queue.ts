import { and, eq, lte, sql, or, isNull } from "drizzle-orm";
import { newId } from "@plinth/shared";
import type { Database, Executor } from "./client";
import { jobs } from "./schema";

export type JobRow = typeof jobs.$inferSelect;

/**
 * Durable job queue on Postgres. Enqueue happens in the SAME transaction as the state change that
 * caused it (transactional outbox), so a crash can never lose or duplicate the follow-up work.
 * `dedupeKey` makes enqueue idempotent per queue.
 */
export async function enqueue(
  tx: Executor,
  queue: string,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<void> {
  await tx
    .insert(jobs)
    .values({
      id: newId("evt").replace("evt_", "job_"),
      queue,
      payload,
      dedupeKey: opts.dedupeKey ?? null,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 8,
    })
    .onConflictDoNothing();
}

/** Claim up to `limit` due jobs. Locks expire so crashed workers' jobs are re-claimed (at-least-once). */
export async function claimJobs(db: Database, queue: string, limit = 10, lockMs = 60_000): Promise<JobRow[]> {
  return db.transaction(async (tx) => {
    const due = (await tx.execute(sql`
      select id from ${jobs}
      where queue = ${queue}
        and status in ('PENDING','RUNNING')
        and run_at <= now()
        and (locked_until is null or locked_until < now())
      order by run_at
      limit ${limit}
      for update skip locked`)) as unknown as { rows: { id: string }[] };
    const ids = due.rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const lockedUntil = new Date(Date.now() + lockMs);
    const rows: JobRow[] = [];
    for (const id of ids) {
      const [row] = await tx
        .update(jobs)
        .set({ status: "RUNNING", lockedUntil, attempts: sql`${jobs.attempts} + 1` })
        .where(eq(jobs.id, id))
        .returning();
      if (row) rows.push(row);
    }
    return rows;
  });
}

export async function completeJob(db: Executor, id: string): Promise<void> {
  await db.update(jobs).set({ status: "DONE", lockedUntil: null, finishedAt: new Date() }).where(eq(jobs.id, id));
}

/** Exponential backoff with cap; moves to FAILED after maxAttempts. */
export async function failJob(db: Executor, job: JobRow, error: string): Promise<void> {
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffSec = Math.min(3600, 2 ** Math.min(job.attempts, 12) * 5);
  await db
    .update(jobs)
    .set({
      status: exhausted ? "FAILED" : "PENDING",
      lockedUntil: null,
      lastError: error.slice(0, 1000),
      runAt: new Date(Date.now() + backoffSec * 1000),
      finishedAt: exhausted ? new Date() : null,
    })
    .where(eq(jobs.id, job.id));
}

export { and, eq, lte, or, isNull };
