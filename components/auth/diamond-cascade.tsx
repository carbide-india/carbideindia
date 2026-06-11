const RED = "#D32F2F";
const INDIGO = "#3F3F94";
const SILVER = "#C9CBD2";
const SILVER_LIGHT = "#DDDEE3";

/**
 * The diamond checker cascade from Carbide India's business card — rotated
 * squares in silver / red / indigo stepping down from the top-left corner,
 * with the tagline running diagonally beside them, exactly like the print
 * collateral. Pure decoration (aria-hidden), deterministic layout.
 *
 * Lattice coordinates: each diamond is a square rotated 45°, centred at
 * (col·S, row·S) where S is half the diagonal — so odd/even col+row parity
 * produces the touching-corners checker of the card.
 */
const S = 44; // half-diagonal spacing
const D = 58; // diamond diagonal (slightly smaller than 2·S → thin gaps)

// (col, row, color) in lattice units — eyeballed from the card: a dense
// silver field with red/indigo accents, thinning toward the tail.
const DIAMONDS: ReadonlyArray<readonly [number, number, string]> = [
  [1, 1, RED], [3, 1, SILVER], [5, 1, SILVER_LIGHT], [7, 1, RED],
  [0, 2, INDIGO], [2, 2, SILVER], [4, 2, SILVER], [6, 2, SILVER_LIGHT],
  [1, 3, SILVER], [3, 3, SILVER_LIGHT], [5, 3, RED],
  [2, 4, SILVER_LIGHT], [4, 4, INDIGO], [6, 4, SILVER],
  [1, 5, INDIGO], [3, 5, SILVER], [5, 5, SILVER_LIGHT], [7, 5, RED],
  [2, 6, SILVER], [4, 6, SILVER_LIGHT],
  [3, 7, SILVER], [5, 7, SILVER],
  [4, 8, SILVER_LIGHT],
];

export function DiamondCascade({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 620 460"
      width="620"
      height="460"
      fill="none"
    >
      {DIAMONDS.map(([c, r, color], i) => {
        const cx = c * S;
        const cy = r * S;
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
        transform="translate(360 88) rotate(45)"
        style={{
          fontFamily: "var(--font-display), var(--font-sans), sans-serif",
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: "0.01em",
        }}
      >
        <tspan x="0" dy="0" fill={INDIGO}>Your Tungsten</tspan>
        <tspan x="0" dy="27" fill={INDIGO}>Carbide &amp;</tspan>
        <tspan x="0" dy="27" fill={INDIGO}>Tungsten Copper</tspan>
        <tspan x="0" dy="27" fill={RED}>Partners</tspan>
      </text>
    </svg>
  );
}
