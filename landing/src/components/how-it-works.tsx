import Image from "next/image";

const BEATS = [
  {
    n: "01",
    title: "She opens",
    body: "She calls out something from last time — the dog, the cat, your unreliable neighbour. No blank page.",
    image: "/assets/shot-open.png",
    alt: "Open screen",
  },
  {
    n: "02",
    title: "You talk",
    body: "Mic open the whole time. Fumble, and she asks you to say it again — she genuinely didn't catch it.",
    image: "/assets/screen-02-converse.png",
    alt: "Converse screen",
  },
  {
    n: "03",
    title: "She tells you",
    body: "Three patterns, ranked by what got in the way of being understood — plus what you steered around.",
    image: "/assets/screen-03-debrief.png",
    alt: "Debrief screen",
  },
  {
    n: "04",
    title: "Tomorrow",
    body: "Same scene, one notch harder — the cat's ill, and she wants it in the tense you avoided today.",
    image: "/assets/screen-04-tomorrow.png",
    alt: "Tomorrow screen",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="bg-paper-stepped">
      <div className="mx-auto max-w-[1280px] px-5 md:px-14">
        <div className="pt-14 pb-6 md:pt-16 md:pb-8">
          <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-ink/64 uppercase">
            How a session goes
          </p>
          <h2 className="mt-5 max-w-[700px] text-balance font-serif text-[34px] leading-[1.12] tracking-[-0.02em] md:text-[46px]">
            Eight minutes, four beats, no homework.
          </h2>
        </div>

        <div className="grid gap-[22px] pb-14 sm:grid-cols-2 lg:grid-cols-4 md:pb-16">
          {BEATS.map((beat) => (
            <article key={beat.n}>
              <div className="relative flex justify-center overflow-hidden rounded-[20px] border border-ink/9 bg-card px-[22px] pt-[22px]">
                <Image
                  src={beat.image}
                  alt={beat.alt}
                  width={420}
                  height={840}
                  className="mb-[-24px] h-auto w-full rounded-[14px] shadow-[0_-8px_24px_-10px_rgba(35,31,24,0.22)]"
                />
              </div>
              <div className="mt-[18px] flex items-baseline gap-[10px]">
                <span className="font-mono text-[11px] font-medium text-accent">
                  {beat.n}
                </span>
                <h3 className="font-serif text-[21px] leading-[1.2]">
                  {beat.title}
                </h3>
              </div>
              <p className="mt-[11px] text-pretty font-sans text-[15px] leading-[1.6] text-ink/70">
                {beat.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
