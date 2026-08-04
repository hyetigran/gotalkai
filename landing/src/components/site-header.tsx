import Image from "next/image";
import { DisabledCta } from "./disabled-cta";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between py-[26px] md:py-[34px]">
      <a href="#top" className="flex items-center gap-[11px]">
        <Image
          src="/assets/lingo-icon.png"
          alt="LingoAI"
          width={40}
          height={40}
          className="rounded-[11px]"
        />
        <span className="font-sans text-[22px] font-bold tracking-[-0.02em] text-ink">
          LingoAI
        </span>
      </a>
      <nav className="hidden items-center gap-8 md:flex">
        <a href="#cast" className="font-sans text-[15px] font-medium text-nav hover:text-accent">
          Who you&apos;ll meet
        </a>
        <a href="#how" className="font-sans text-[15px] font-medium text-nav hover:text-accent">
          How it works
        </a>
        <a href="#price" className="font-sans text-[15px] font-medium text-nav hover:text-accent">
          Pricing
        </a>
        <ThemeToggle />
        <DisabledCta className="px-5 py-[13px] text-[15px]">
          Start free
        </DisabledCta>
      </nav>
      <div className="flex items-center gap-3 md:hidden">
        <ThemeToggle />
        <DisabledCta className="px-4 py-3 text-[14px]">
          Start free
        </DisabledCta>
      </div>
    </header>
  );
}
