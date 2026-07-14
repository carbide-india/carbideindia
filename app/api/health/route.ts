import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Phase 4.5 - actually checks the dependency an external uptime monitor
 * cares about. Returns 200 only if Postgres responds within the timeout
 * below; otherwise 503 with a per-check breakdown so the alert that pages
 * you also tells you where to look. (File storage is Vercel Blob - fully
 * managed, no ping needed; document features degrade cleanly if it's down.)
 *
 * Public (allowed by middleware's PUBLIC_API allowlist). Safe to expose
 * - no DB rows or secrets leak, only liveness booleans + latencies.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

const DB_TIMEOUT_MS = 1500;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function checkDb(): Promise<Check> {
  const started = performance.now();
  try {
    await withTimeout(db.execute(sql`select 1`), DB_TIMEOUT_MS, "db");
    return { name: "db", ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      name: "db",
      ok: false,
      ms: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const dbCheck = await checkDb();

  return Response.json(
    {
      ok: dbCheck.ok,
      service: "carbide-india-wms",
      ts: new Date().toISOString(),
      checks: [dbCheck],
    },
    { status: dbCheck.ok ? 200 : 503 },
  );
}
