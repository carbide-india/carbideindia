import Image from "next/image";
import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/ip-gate";

export const metadata = { title: "Access Denied - Carbide India" };
export const dynamic = "force-dynamic";

/**
 * Branded 403 page. Unreachable for allowed visitors - the middleware
 * rewrites IP-blocked requests here (status 403) and redirects allowed
 * visitors who hit /access-denied directly back to the dashboard.
 *
 * It surfaces the IP the server actually detected so an admin can whitelist
 * the exact value in ALLOWED_IPS (comma-separated) without guessing.
 */
export default async function AccessDeniedPage() {
  const h = await headers();
  const detectedIp = clientIpFromHeaders(h) || "unknown";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-6 text-center">
      <Image src="/brand/logo.png" alt="Carbide India" width={220} height={120} priority />
      <h1
        className="text-3xl font-semibold tracking-tight text-[#3F3F94]"
        style={{ fontFamily: "var(--font-display, system-ui, sans-serif)" }}
      >
        Access Denied
      </h1>
      <p className="max-w-md text-sm text-neutral-500">
        This system is restricted to authorized Carbide India locations.
        If you believe you should have access, contact your administrator.
      </p>
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
        <p className="text-[11px] uppercase tracking-widest text-neutral-400">
          Your detected IP
        </p>
        <p className="mt-1 font-mono text-base font-semibold text-neutral-700">
          {detectedIp}
        </p>
        <p className="mt-1 text-[11px] text-neutral-400">
          Add this to ALLOWED_IPS (comma-separated) to grant access.
        </p>
      </div>
      <p className="text-xs uppercase tracking-widest text-[#D32F2F]">
        Yogeshwar Engineering Pvt Ltd · Nashik
      </p>
    </main>
  );
}
