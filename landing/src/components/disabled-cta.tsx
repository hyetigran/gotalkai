type CtaButtonProps = {
  children: React.ReactNode;
  className?: string;
};

/** Placeholder CTA — app store / TestFlight not wired yet. */
export function DisabledCta({ children, className = "" }: CtaButtonProps) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Coming soon"
      className={`cursor-not-allowed rounded-[15px] bg-accent px-8 py-5 font-serif text-[19px] text-paper opacity-55 shadow-[0_2px_0_rgba(35,31,24,0.16)] ${className}`}
    >
      {children}
    </button>
  );
}
