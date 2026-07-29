export function SiteHeader() {
  return (
    <header className="flex items-center justify-between pt-[28px] md:pt-[34px]">
      <a href="#top" className="font-serif text-[20px] tracking-[-0.01em] text-ink">
        Talk AI<span className="text-accent">.</span>
      </a>
      <nav className="hidden items-center gap-8 md:flex">
        <a href="#cast" className="font-sans text-[14px] text-ink/64 hover:text-accent">
          Who you&apos;ll meet
        </a>
        <a href="#how" className="font-sans text-[14px] text-ink/64 hover:text-accent">
          How it works
        </a>
        <a href="#price" className="font-sans text-[14px] text-ink/64 hover:text-accent">
          Price
        </a>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Coming soon"
          className="cursor-not-allowed rounded-xl bg-accent px-5 py-[13px] font-serif text-[15px] text-paper opacity-55 shadow-[0_2px_0_rgba(35,31,24,0.14)]"
        >
          Start free
        </button>
      </nav>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Coming soon"
        className="cursor-not-allowed rounded-xl bg-accent px-4 py-3 font-serif text-[14px] text-paper opacity-55 md:hidden"
      >
        Start free
      </button>
    </header>
  );
}
