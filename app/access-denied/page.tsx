import Image from "next/image";

export const metadata = { title: "Access Denied — Carbide India" };

/**
 * Branded 403 page. Unreachable for allowed visitors — the middleware
 * rewrites IP-blocked requests here (status 403) and redirects allowed
 * visitors who hit /access-denied directly back to the dashboard.
 */
export default function AccessDeniedPage() {
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
      <p className="text-xs uppercase tracking-widest text-[#D32F2F]">
        Yogeshwar Engineering Pvt Ltd · Nashik
      </p>
    </main>
  );
}
