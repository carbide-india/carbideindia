import { NextResponse } from "next/server";
import { purgeAllExpiredDrafts } from "@/lib/queries/form-drafts";
import { purgeExpiredRecycledInquiries } from "@/app/(app)/inquiries/recycle-actions";

/**
 * Nightly purge of recycled form drafts past their 48h TTL.
 *
 * The app already purges lazily — but only the current owner's rows, and only
 * when that owner saves a draft or opens their recycle bin. This sweep runs
 * across ALL owners so nothing lingers past 48 hours regardless of who returns.
 *
 * Authentication: same pattern as the other cron routes — requires
 *   Authorization: Bearer <CRON_SECRET>
 * which Vercel Cron supplies automatically when CRON_SECRET is set. Local test:
 *   curl -X POST http://localhost:3000/api/cron/purge-recycled \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Runs on the Node runtime — postgres-js needs Node APIs.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  // Constant-shape rejection so we never reveal whether the env var is set.
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const drafts = await purgeAllExpiredDrafts();
    const inquiries = await purgeExpiredRecycledInquiries();
    return NextResponse.json({ ok: true, draftsPurged: drafts.purged, inquiriesPurged: inquiries.purged });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/purge-recycled] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// Both GET (Vercel Cron's default) and POST (testability) accepted.
export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
