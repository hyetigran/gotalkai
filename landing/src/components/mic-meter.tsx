"use client";

const BAR_HEIGHTS = [0.4, 0.72, 1, 0.84, 0.55, 0.92, 0.6, 0.36, 0.76, 0.48];

type MicMeterProps = {
  /** "accent" sits on a light card (hero); "gold-on-dark" sits on the purple gradient panel. */
  variant?: "accent" | "gold-on-dark";
  height?: number;
};

export function MicMeter({ variant = "accent", height = 28 }: MicMeterProps) {
  const active = variant === "accent" ? "var(--accent)" : "#FFC857";
  const dim =
    variant === "accent" ? "var(--line)" : "rgba(255,255,255,0.42)";

  return (
    <div
      className="flex items-center gap-1"
      style={{ height }}
      aria-hidden="true"
    >
      {BAR_HEIGHTS.map((scale, index) => (
        <div
          key={index}
          className="animate-lg-bar w-[3px] shrink-0 rounded-[2px]"
          style={
            {
              height: Math.round(height * scale),
              background: index % 3 === 0 ? active : dim,
              "--bar-dur": `${(0.62 + (index % 4) * 0.16).toFixed(2)}s`,
              "--bar-delay": `${(index * 0.07).toFixed(2)}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
