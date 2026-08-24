/**
 * The Prime Vantage mark: a square with three ledger lines, the middle one
 * shorter. `variant` picks the colourway used across surfaces.
 */
export function Wordmark({
  size = 22,
  variant = "accent",
}: {
  size?: number;
  variant?: "accent" | "inverted";
}) {
  const bg = variant === "accent" ? "#1F3D8C" : "#F4F2EF";
  const line = variant === "accent" ? "#F4F2EF" : "#1A1917";
  const u = size / 22; // design drawn at 22px
  const lineStyle = (top: number, rightInset: number) => ({
    position: "absolute" as const,
    left: 5 * u,
    right: rightInset * u,
    top: top * u,
    height: Math.max(1.5 * u, 1.5),
    background: line,
  });
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: 2,
        position: "relative",
        flex: "none",
      }}
    >
      <div style={lineStyle(6, 5)} />
      <div style={lineStyle(10.5, 9)} />
      <div style={lineStyle(15, 5)} />
    </div>
  );
}
