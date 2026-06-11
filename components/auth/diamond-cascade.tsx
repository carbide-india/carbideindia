const RED = "#D32F2F";
const INDIGO = "#3F3F94";
const SILVER = "#CDD0D6";
const SILVER_LIGHT = "#DEE0E5";

/**
 * The diamond checker cascade from Carbide India's business card — a dense
 * field of rotated squares in silver with red / indigo accents stepping down
 * from the top-left corner, the tagline running diagonally beside it.
 * Pure decoration (aria-hidden), deterministic layout.
 *
 * Lattice: diamonds centred at (col·S, row·S); same-parity col+row produces
 * the touching-corners checker of the printed card.
 */
const S = 46; // half-diagonal spacing
const D = 64; // diamond diagonal

// (col, row, color) — dense upper-left triangle, thinning to a tail,
// accents placed like the card render: reds at the top-right edge, mid
// and lower tail; indigos mid-left.
const DIAMONDS: ReadonlyArray<readonly [number, number, string]> = [
  [1, 0, SILVER_LIGHT], [3, 0, SILVER], [5, 0, RED],
  [0, 1, SILVER], [2, 1, SILVER_LIGHT], [4, 1, SILVER],
  [1, 2, SILVER], [3, 2, RED], [5, 2, SILVER_LIGHT],
  [0, 3, INDIGO], [2, 3, SILVER_LIGHT], [4, 3, SILVER],
  [1, 4, SILVER_LIGHT], [3, 4, INDIGO], [5, 4, RED],
  [0, 5, SILVER], [2, 5, SILVER], [4, 5, SILVER_LIGHT],
  [1, 6, SILVER_LIGHT], [3, 6, SILVER],
  [2, 7, SILVER],
];

export function DiamondCascade({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 560 400"
      width="560"
      height="400"
      fill="none"
    >
      {DIAMONDS.map(([c, r, color], i) => {
        const cx = c * S + 8;
        const cy = r * S + 8;
        const h = D / 2;
        return (
          <path
            key={i}
            d={`M ${cx} ${cy - h} L ${cx + h} ${cy} L ${cx} ${cy + h} L ${cx - h} ${cy} Z`}
            fill={color}
          />
        );
      })}
      {/* Diagonal tagline, indigo with red "Partners" — as printed. */}
      <text
        transform="translate(322 56) rotate(45)"
        style={{
          fontFamily: "var(--font-display), var(--font-sans), sans-serif",
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "0.005em",
        }}
      >
        <tspan x="0" dy="0" fill={INDIGO}>Your Tungsten</tspan>
        <tspan x="0" dy="30" fill={INDIGO}>Carbide &amp;</tspan>
        <tspan x="0" dy="30" fill={INDIGO}>Tungsten Copper</tspan>
        <tspan x="0" dy="30" fill={RED}>Partners</tspan>
      </text>
    </svg>
  );
}
