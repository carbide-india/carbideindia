import { Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

interface Props {
  firebaseAvailable: boolean;
  firebaseError: string | null;
  /** True when no session row has ever been written - the "not wired yet" case. */
  noSessionRows: boolean;
  idleTimeoutMinutes: number;
  sessionMaxHours: number;
}

/**
 * States plainly what this page can and cannot observe. Session visibility is
 * exactly the kind of screen where a confident-looking blank is dangerous, so
 * the limits are printed rather than implied.
 */
export function SessionsNotice({
  firebaseAvailable,
  firebaseError,
  noSessionRows,
  idleTimeoutMinutes,
  sessionMaxHours,
}: Props) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-start gap-3 rounded-lg border border-[#E3E7F1] bg-[#F7F8FC] px-4 py-3">
        <Info
          size={16}
          strokeWidth={2.2}
          aria-hidden
          className="mt-0.5 shrink-0 text-[#3F3F94]"
        />
        <div className="text-[13px] leading-relaxed text-[#475069]">
          <p>
            Sign-in is handled by <strong className="text-[#0F172A]">Firebase</strong>,
            which has no API for listing active sessions. This page shows only what
            is genuinely observable: session records this app writes itself,
            Firebase&rsquo;s per-user sign-in metadata, and registered web-push
            devices. Anything not observable is left blank rather than guessed.
          </p>
          <p className="mt-1.5 tabular-nums">
            Online means seen within{" "}
            <strong className="text-[#0F172A]">{idleTimeoutMinutes} min</strong>; a
            record stops counting as live after{" "}
            <strong className="text-[#0F172A]">{sessionMaxHours} h</strong>. Both
            come from Admin{" "}
            <Link
              href={"/admin/settings" as Route}
              className="font-semibold text-[#3F3F94] underline underline-offset-2"
            >
              Settings
            </Link>
            .
          </p>
          <p className="mt-1.5">
            Revoking marks our records dead, removes push devices, and invalidates
            Firebase refresh tokens - but a session cookie already in a browser
            stays valid until it expires. To cut someone off immediately,
            deactivate them in{" "}
            <Link
              href={"/admin/employees" as Route}
              className="font-semibold text-[#3F3F94] underline underline-offset-2"
            >
              Employees
            </Link>
            ; that is checked on every request.
          </p>
        </div>
      </div>

      {!firebaseAvailable && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3"
        >
          <TriangleAlert
            size={16}
            strokeWidth={2.2}
            aria-hidden
            className="mt-0.5 shrink-0 text-[#B45309]"
          />
          <p className="text-[13px] leading-relaxed text-[#92600A]">
            Firebase sign-in metadata could not be loaded, so the &ldquo;last
            sign-in&rdquo; column falls back to our own records only.
            {firebaseError ? ` (${firebaseError})` : ""}
          </p>
        </div>
      )}

      {noSessionRows && (
        <div className="flex items-start gap-3 rounded-lg border border-[#E3E7F1] bg-white px-4 py-3">
          <Info
            size={16}
            strokeWidth={2.2}
            aria-hidden
            className="mt-0.5 shrink-0 text-[#8b93a3]"
          />
          <p className="text-[13px] leading-relaxed text-[#475069]">
            No session records exist yet. A record is written the first time a
            signed-in person is observed - opening this page records your own
            session, and any page that calls{" "}
            <code className="rounded bg-[#F1F3F8] px-1 py-0.5 text-[12px]">
              POST /admin/sessions/ping
            </code>{" "}
            records theirs.
          </p>
        </div>
      )}
    </div>
  );
}
