import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="px-5 pt-[88px] pb-14 md:px-14">
      <div className="flex flex-wrap items-center justify-between gap-5 border-t-[1.5px] border-line pt-[30px]">
        <div className="flex items-center gap-[10px]">
          <Image
            src="/assets/lingo-icon.png"
            alt="LingoAI"
            width={28}
            height={28}
            className="rounded-[8px]"
          />
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            LingoAI · Learn languages. Open the world.
          </p>
        </div>
        <div className="flex gap-[26px]">
          <a href="#how" className="font-sans text-[13px] text-muted hover:text-accent">
            Privacy
          </a>
          <a href="#how" className="font-sans text-[13px] text-muted hover:text-accent">
            Method
          </a>
          <a
            href="mailto:hello@gotalkai.app"
            className="font-sans text-[13px] text-muted hover:text-accent"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
