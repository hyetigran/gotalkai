import Image from "next/image";

const CAST = [
  {
    name: "Valentina",
    image: "/assets/lingo-head-3c.png",
    badge: "Open now",
    badgeBg: "#4CD964",
    badgeColor: "#0C3D1B",
    tagline: "Grandmother · 78, and slightly deaf",
    body: "Asks you to speak up, tells long stories about her cat, and remembers every single thing you’ve told her.",
  },
  {
    name: "Elena",
    image: "/assets/lingo-head-1c.png",
    badge: "Next up",
    badgeBg: "#FFC857",
    badgeColor: "#3B2E00",
    tagline: "Barista · warm, patient, nosy",
    body: "Talks a little faster and repeats herself less. Unlocks once Valentina stops having to ask twice.",
  },
  {
    name: "Marco",
    image: "/assets/lingo-head-2c.png",
    badge: "At B1",
    badgeBg: "rgba(42,31,98,0.82)",
    badgeColor: "#ffffff",
    tagline: "Taxi driver · fast, funny, no repeats",
    body: "Talks at traffic speed with the meter running, and will not slow down for anybody.",
  },
] as const;

export function Cast() {
  return (
    <section id="cast" className="bg-band py-[76px] md:py-[84px]">
      <div className="mx-auto max-w-[1280px] px-5 md:px-14">
        <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          Who you&apos;ll meet
        </p>
        <h2 className="mt-[18px] max-w-[660px] text-balance font-sans text-[34px] leading-[1.15] font-bold tracking-[-0.03em] md:text-[42px]">
          A whole cast, unlocking one at a time as you get better.
        </h2>

        <div className="mt-10 grid items-stretch gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
          {CAST.map((person) => (
            <article
              key={person.name}
              className="flex flex-col rounded-[26px] border-[1.5px] border-line bg-card px-[26px] pt-7 pb-[30px] shadow-[0_18px_44px_-26px_var(--sh)]"
            >
              <div className="flex items-center gap-4">
                <div className="size-24 shrink-0 overflow-hidden rounded-full bg-tint shadow-[0_0_0_3px_var(--line)]">
                  <Image
                    src={person.image}
                    alt={person.name}
                    width={96}
                    height={96}
                    className="size-24 object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-sans text-[21px] leading-[1.2] font-semibold tracking-[-0.01em]">
                    {person.name}
                  </p>
                  <span
                    className="mt-[9px] inline-flex rounded-full px-3 py-2 font-sans text-[10px] font-semibold tracking-[0.09em] uppercase"
                    style={{ background: person.badgeBg, color: person.badgeColor }}
                  >
                    {person.badge}
                  </span>
                </div>
              </div>
              <p className="mt-5 font-sans text-[14px] leading-[1.45] font-medium text-accent">
                {person.tagline}
              </p>
              <p className="mt-[9px] text-pretty font-sans text-[14px] leading-[1.6] text-body">
                {person.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
