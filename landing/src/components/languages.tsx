const LANGUAGES = [
  { label: "Russian · live", live: true },
  { label: "Ukrainian", live: false },
  { label: "Polish", live: false },
  { label: "Italian", live: false },
  { label: "Spanish", live: false },
  { label: "Armenian", live: false },
] as const;

export function Languages() {
  return (
    <div className="flex flex-col gap-5 pb-20 md:flex-row md:items-center md:gap-[22px] md:pb-24">
      <p className="max-w-[150px] shrink-0 font-mono text-[10px] font-medium tracking-[0.12em] text-ink/64 uppercase">
        Available now
        <br />
        More this year
      </p>
      <div className="flex flex-wrap gap-[10px]">
        {LANGUAGES.map((language) => (
          <span
            key={language.label}
            className={`inline-flex items-center gap-[9px] rounded-full px-[17px] py-[11px] font-serif text-[16px] ${
              language.live
                ? "border border-accent/40 bg-card text-ink shadow-[0_2px_8px_-4px_rgba(35,31,24,0.2)]"
                : "border border-ink/16 text-ink/64"
            }`}
          >
            <span
              className={`size-[6px] shrink-0 rounded-full ${
                language.live
                  ? "animate-lp-blink bg-accent"
                  : "bg-ink/24"
              }`}
            />
            {language.label}
          </span>
        ))}
      </div>
    </div>
  );
}
