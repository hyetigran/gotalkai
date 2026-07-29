"use client";

const BAR_HEIGHTS = [0.4, 0.72, 1, 0.84, 0.55, 0.92, 0.6, 0.36, 0.76, 0.48];

type MicMeterProps = {
  variant?: "light" | "dark";
  height?: number;
};

export function MicMeter({ variant = "light", height = 28 }: MicMeterProps) {
  const active = variant === "light" ? "#A0543A" : "#E4A184";
  const dim =
    variant === "light" ? "rgba(160,84,58,0.5)" : "rgba(251,246,236,0.34)";

  return (
    <div
      className="flex items-center gap-1"
      style={{ height }}
      aria-hidden="true"
    >
      {BAR_HEIGHTS.map((scale, index) => (
        <div
          key={index}
          className="animate-lp-bar w-[3px] shrink-0 rounded-[2px]"
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
