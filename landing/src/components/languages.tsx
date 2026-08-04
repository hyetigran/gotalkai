const LANGUAGES = [
  { label: "Russian", live: true },
  { label: "Italian", live: false },
  { label: "Spanish", live: false },
  { label: "French", live: false },
  { label: "Japanese", live: false },
  { label: "Portuguese", live: false },
  { label: "Armenian", live: false },
] as const;

export function Languages() {
  return (
    <div className="flex flex-col gap-6 pb-24 md:flex-row md:items-center md:gap-6 md:pb-[104px]">
      <p className="max-w-[130px] shrink-0 font-sans text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        Live now
        <br />
        More this year
      </p>
      <div className="flex flex-wrap gap-[10px]">
        {LANGUAGES.map((language) => (
          <span
            key={language.label}
            className={`inline-flex items-center gap-[9px] rounded-full px-[18px] py-[11px] font-sans text-[15px] font-medium ${
              language.live
                ? "border-[1.5px] border-[#DDD7FA] bg-card text-ink shadow-[0_4px_12px_-6px_var(--sh)]"
                : "border-[1.5px] border-line bg-band text-muted"
            }`}
          >
            <span
              className={`size-[7px] shrink-0 rounded-full ${
                language.live ? "animate-lg-pulse bg-[#4CD964]" : "bg-line"
              }`}
            />
            {language.live ? `${language.label} · live` : language.label}
          </span>
        ))}
      </div>
    </div>
  );
}
