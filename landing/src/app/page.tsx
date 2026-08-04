import { Cast } from "@/components/cast";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Languages } from "@/components/languages";
import { OneRealDecision } from "@/components/one-real-decision";
import { Pillars } from "@/components/pillars";
import { Pricing } from "@/components/pricing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Wall } from "@/components/wall";

export default function HomePage() {
  return (
    <div id="top">
      <div className="mx-auto max-w-[1240px] px-5 md:px-12">
        <SiteHeader />
        <Hero />
        <Languages />
        <Wall />
      </div>

      <Cast />

      <div className="mx-auto max-w-[1240px] px-5 md:px-12">
        <OneRealDecision />
        <HowItWorks />
        <Pillars />
        <Pricing />
        <SiteFooter />
      </div>
    </div>
  );
}
