import type { ReactNode } from "react";

/**
 * Auth segment layout - a plain passthrough. The login page paints its own
 * full-viewport drafting sheet, and /welcome only redirects, so the old
 * decorative stage here was dead weight rendered behind an opaque overlay
 * (and its footer marquee peeked through on short viewports).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
