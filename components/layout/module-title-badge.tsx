"use client";

/**
 * ModuleTitleBadge - the module name in the app header, rendered as a boxed,
 * animated badge so the user always knows which module they're in (Forms /
 * Masters / …). Motion: an entrance pop, a gently pulsing outline glow, a
 * shimmering gradient wordmark, and a breathing status dot. All motion is
 * disabled under prefers-reduced-motion.
 */
export function ModuleTitleBadge({
  title,
  align = "center",
}: {
  title: string;
  /** "center" floats it between the left buttons and the search; "start" keeps
   *  it right next to the buttons (used on the launchpad where there's no
   *  Back-to-Forms button to fill the gap). */
  align?: "center" | "start";
}) {
  return (
    <div className={align === "start" ? "shrink-0" : "mx-auto shrink-0"}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes mtbIn { from { opacity: 0; transform: translateY(-8px) scale(.9) } to { opacity: 1; transform: none } }
        @keyframes mtbGlow {
          0%, 100% { box-shadow: 0 2px 8px rgba(63,63,148,0.12); border-color: rgba(63,63,148,0.35) }
          50% { box-shadow: 0 0 0 4px rgba(63,63,148,0.10), 0 6px 18px rgba(63,63,148,0.28); border-color: rgba(63,63,148,0.75) }
        }
        @keyframes mtbShine { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
        @keyframes mtbDot { 0%, 100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: .5 } }
        .mtb-badge {
          display: inline-flex; align-items: center; gap: 10px;
          border: 2px solid rgba(63,63,148,0.35); border-radius: 12px;
          background: #FFFFFF;
          padding: 7px 20px;
          animation: mtbIn .5s cubic-bezier(.22,.61,.36,1) both, mtbGlow 2.8s ease-in-out infinite .5s;
        }
        .mtb-badge:hover { animation-play-state: paused, paused; }
        .mtb-dot {
          width: 8px; height: 8px; border-radius: 999px; background: #3f3f94;
          box-shadow: 0 0 0 3px rgba(63,63,148,0.18);
          animation: mtbDot 1.8s ease-in-out infinite;
        }
        .mtb-text {
          font-weight: 900; font-size: 21px; letter-spacing: 0.18em; line-height: 1;
          text-transform: uppercase; padding-left: 0.18em;
          color: #1F2547;
        }
        @media (prefers-reduced-motion: reduce) {
          .mtb-badge, .mtb-dot, .mtb-text { animation: none }
          .mtb-text { color: #3f3f94 }
        }
      `,
        }}
      />
      <span className="mtb-badge">
        <span className="mtb-dot" aria-hidden />
        <span className="mtb-text">{title}</span>
      </span>
    </div>
  );
}
