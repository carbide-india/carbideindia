export function WelcomeHero() {
  return (
    <section
      className="mx-auto max-w-[960px] px-8 max-md:px-4 mt-16 mb-24"
      style={{
        opacity: 0,
        animation: "fadeUp 600ms ease-out 100ms forwards",
      }}
    >
      <div
        className="rounded-section p-16 max-md:p-8 text-center"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(225, 6, 0, 0.10), transparent 70%), linear-gradient(180deg, var(--color-surface-card) 0%, var(--color-surface-soft) 100%)",
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        <h1
          className="text-ink-strong"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 400,
            fontSize: 48,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          Welcome.
        </h1>
        <p
          className="text-body-lg text-ink-muted mt-5 mx-auto"
          style={{ maxWidth: 520, lineHeight: 1.6 }}
        >
          No data yet. Once tasks start being logged, this dashboard becomes
          the single source of truth for the team — replacing the old
          Sheets-based system.
        </p>

        <p className="text-ink-subtle text-[15px] mt-8">
          Read-only in M1.5. Task entry, transfers, and admin live in M2.
        </p>
      </div>
    </section>
  );
}
