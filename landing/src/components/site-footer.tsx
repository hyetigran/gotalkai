export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-14 md:py-14">
      <p className="font-mono text-[12px] leading-relaxed text-ink/64">
        Talk AI · speaking practice that talks back
      </p>
      <div className="flex gap-[26px]">
        <a
          href="mailto:hello@gotalkai.app"
          className="font-mono text-[12px] text-ink/64 hover:text-accent"
        >
          Contact
        </a>
        <a href="#how" className="font-mono text-[12px] text-ink/64 hover:text-accent">
          Method
        </a>
        <a href="#price" className="font-mono text-[12px] text-ink/64 hover:text-accent">
          Waitlist
        </a>
      </div>
    </footer>
  );
}
