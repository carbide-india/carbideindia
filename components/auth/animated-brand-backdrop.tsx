"use client";

/**
 * Cinematic brand backdrop for /login. (rev 4 — Carbide India)
 *
 * Two elements loop a slow ballet across the viewport: the Carbide
 * India brand-mark on the LEFT, the stacked "Carbide India" display
 * wordmark on the RIGHT. Both fade in at centre, slide apart, park at
 * the edges, then drift back and fade out. Designed to read as ambient
 * video — the form card is the hero.
 *
 * The brand-mark is `/brand/logo.png` (red script "Carbide" + indigo
 * block "India" on white), so it rides inside a soft white chip — the
 * same treatment the header and admin sidebar use — to stay legible
 * over the dark canvas.
 *
 * The right lane stacks "Carbide" / "India" on two lines so neither
 * word gets clipped at the viewport edge. The left lane parks at
 * 40vw (further than the right's 28vw) to read as the dominant
 * brand presence behind the form card.
 *
 * Respects `prefers-reduced-motion`: the orbit animations are
 * disabled and the elements snap to their parked positions.
 */
export function AnimatedBrandBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* ── Brand-mark lane (orbits to the LEFT) ── */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="carbide-brand-mark"
          style={{ width: "clamp(220px, 24vw, 420px)" }}
        >
          {/* Logo artwork lives on white, so present it in a soft white
              chip rather than compositing it raw onto the dark canvas. */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.96)",
              borderRadius: 24,
              padding: "10% 8%",
              boxShadow:
                "0 24px 80px rgba(63, 63, 148, 0.35), 0 0 40px rgba(0, 0, 0, 0.35)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt=""
              draggable={false}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                userSelect: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Stacked-wordmark lane (orbits to the RIGHT) ── */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="carbide-brand-wordmark">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(72px, 11vw, 200px)",
              lineHeight: 0.92,
              letterSpacing: "-0.035em",
              textAlign: "center",
              color: "rgba(255, 255, 255, 0.96)",
              textShadow:
                "0 24px 80px rgba(0, 0, 0, 0.55), 0 2px 0 rgba(255, 255, 255, 0.06)",
              whiteSpace: "nowrap",
            }}
          >
            {/* Stacked so the wordmark never spills past the viewport
                edge — "Carbide" (brand red) on top, "India" (brand
                indigo, brightened for the dark canvas) below. */}
            <div
              style={{
                background:
                  "linear-gradient(110deg, #E57373, #D32F2F 50%, #B71C1C)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Carbide
            </div>
            <div
              style={{
                background:
                  "linear-gradient(110deg, #9D9DDB, #7979B4 50%, #3F3F94)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              India
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        /*
         * Loop choreography (22s):
         *   0%   — invisible at centre
         *   8%   — faded in at centre, overlapping
         *   28%  — fully split, parked at outer edges
         *   70%  — still parked (a long, calm rest — the "settled" feel)
         *   88%  — drifted back to centre
         *   100% — faded out, ready to restart
         *
         * Brand-mark parks at the midpoint between the viewport's left
         * edge and the form card's left edge. Card max-width is 660px
         * centred, so the empty left strip spans 0 → (W-660)/2 and its
         * midpoint sits at (W-660)/4. The logo starts at viewport
         * centre (W/2), so the translate needed to land its centre
         * exactly at that midpoint is:
         *   (W-660)/4 − W/2  =  −(W + 660)/4  =  −25vw − 165px
         * Using calc() makes the math viewport-agnostic — the logo
         * lands in the correct spot on a 1280, 1440, 1920, or 2560
         * screen with no per-breakpoint tuning.
         */
        @keyframes carbide-mark-orbit {
          0%   { transform: translateX(0)                       scale(0.94); opacity: 0; }
          8%   { transform: translateX(0)                       scale(0.96); opacity: 0.55; }
          28%  { transform: translateX(calc(-25vw - 165px))     scale(1);    opacity: 0.95; }
          70%  { transform: translateX(calc(-25vw - 165px))     scale(1);    opacity: 0.95; }
          88%  { transform: translateX(0)                       scale(0.96); opacity: 0.55; }
          100% { transform: translateX(0)                       scale(0.94); opacity: 0; }
        }
        /* Symmetric to the brand-mark — parks at the midpoint between
           the card's RIGHT edge and the viewport's right edge:
             (3W + 660)/4 − W/2  =  (W + 660)/4  =  +25vw + 165px
           Same calc() pattern as the left lane, just positive. */
        @keyframes carbide-wordmark-orbit {
          0%   { transform: translateX(0)                       scale(0.94); opacity: 0; }
          8%   { transform: translateX(0)                       scale(0.96); opacity: 0.40; }
          28%  { transform: translateX(calc(25vw + 165px))      scale(1);    opacity: 0.70; }
          70%  { transform: translateX(calc(25vw + 165px))      scale(1);    opacity: 0.70; }
          88%  { transform: translateX(0)                       scale(0.96); opacity: 0.40; }
          100% { transform: translateX(0)                       scale(0.94); opacity: 0; }
        }
        /* Gentle vertical bob layered on the inner element so even
           during the long parked phase nothing feels frozen. */
        @keyframes carbide-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }

        .carbide-brand-mark {
          animation: carbide-mark-orbit 22s cubic-bezier(0.45, 0, 0.25, 1) infinite;
          will-change: transform, opacity;
        }
        .carbide-brand-wordmark {
          animation: carbide-wordmark-orbit 22s cubic-bezier(0.45, 0, 0.25, 1) infinite;
          will-change: transform, opacity;
        }
        .carbide-brand-mark > :global(div) {
          animation: carbide-bob 6s ease-in-out infinite;
        }
        .carbide-brand-wordmark > :global(div) {
          animation: carbide-bob 6s ease-in-out infinite 0.8s;
        }

        @media (prefers-reduced-motion: reduce) {
          .carbide-brand-mark,
          .carbide-brand-wordmark,
          .carbide-brand-mark > :global(div),
          .carbide-brand-wordmark > :global(div) {
            animation: none;
          }
          .carbide-brand-mark {
            transform: translateX(calc(-25vw - 165px));
            opacity: 0.95;
          }
          .carbide-brand-wordmark {
            transform: translateX(calc(25vw + 165px));
            opacity: 0.7;
          }
        }

        /* Tighter parking + smaller scale on phones. */
        @media (max-width: 768px) {
          .carbide-brand-mark {
            animation-name: carbide-mark-orbit-mobile;
          }
          .carbide-brand-wordmark {
            animation-name: carbide-wordmark-orbit-mobile;
          }
        }
        @keyframes carbide-mark-orbit-mobile {
          0%   { transform: translateX(0)     scale(0.92); opacity: 0; }
          8%   { transform: translateX(0)     scale(0.94); opacity: 0.5; }
          28%  { transform: translateX(-30vw) scale(1);    opacity: 0.85; }
          70%  { transform: translateX(-30vw) scale(1);    opacity: 0.85; }
          88%  { transform: translateX(0)     scale(0.94); opacity: 0.5; }
          100% { transform: translateX(0)     scale(0.92); opacity: 0; }
        }
        @keyframes carbide-wordmark-orbit-mobile {
          0%   { transform: translateX(0)     scale(0.92); opacity: 0; }
          8%   { transform: translateX(0)     scale(0.94); opacity: 0.30; }
          28%  { transform: translateX(22vw)  scale(1);    opacity: 0.55; }
          70%  { transform: translateX(22vw)  scale(1);    opacity: 0.55; }
          88%  { transform: translateX(0)     scale(0.94); opacity: 0.30; }
          100% { transform: translateX(0)     scale(0.92); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
