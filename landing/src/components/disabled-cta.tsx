type CtaButtonProps = {
  children: React.ReactNode;
  className?: string;
  /** "gold" is the hero's high-contrast CTA against the purple gradient; "accent" is the purple pill used everywhere else (header, pricing). */
  variant?: "accent" | "gold";
};

const VARIANT_CLASSES: Record<NonNullable<CtaButtonProps["variant"]>, string> = {
  accent:
    "bg-accent text-white shadow-[0_12px_30px_-10px_rgba(108,92,231,0.7)]",
  gold: "bg-[#FFC857] text-[#3B2E00] shadow-[0_14px_34px_-8px_rgba(255,200,87,0.85),0_0_0_6px_rgba(255,200,87,0.14)]",
};

/** Placeholder CTA — app store / TestFlight not wired yet. */
export function DisabledCta({
  children,
  className = "",
  variant = "accent",
}: CtaButtonProps) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Coming soon"
      className={`cursor-not-allowed rounded-full px-8 py-5 font-sans text-[17px] font-semibold opacity-70 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
