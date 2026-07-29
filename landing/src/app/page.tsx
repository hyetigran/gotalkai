import { Cast } from "@/components/cast";
import { Expressions } from "@/components/expressions";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Languages } from "@/components/languages";
import { Pillars } from "@/components/pillars";
import { Pricing } from "@/components/pricing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Wall } from "@/components/wall";

export default function HomePage() {
  return (
    <div id="top">
      <div className="mx-auto max-w-[1280px] px-5 md:px-14">
        <SiteHeader />
        <Hero />
        <Languages />
        <Wall />
      </div>

      <Cast />
      <Expressions />
      <HowItWorks />

      <div className="mx-auto max-w-[1280px]">
        <Pillars />
        <Pricing />
        <SiteFooter />
      </div>
    </div>
  );
}
