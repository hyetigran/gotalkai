import Image from "next/image";

const CAST = [
  {
    name: "Валентина",
    role: "Grandmother-in-law · retired librarian",
    badge: "open now",
    badgeTone: "open" as const,
    image: "/assets/cast-rosa.png",
    bg: "#F0E4E4",
    border: "solid",
    mute: false,
  },
  {
    name: "Елена Николаевна",
    role: "Mother-in-law · school administrator",
    badge: "next up",
    badgeTone: "locked" as const,
    image: "/assets/cast-maria.png",
    bg: "#DDE5DC",
    border: "dashed",
    mute: false,
  },
  {
    name: "Маша",
    role: "Cousin-in-law · barista, 26",
    badge: "at B1",
    badgeTone: "locked" as const,
    image: "/assets/cast-sofia.png",
    bg: "#F4DCC4",
    border: "solid",
    mute: true,
  },
  {
    name: "Дима",
    role: "Taxi driver · Ярославль",
    badge: "at B2",
    badgeTone: "locked" as const,
    image: "/assets/cast-marco.png",
    bg: "#F5DFA8",
    border: "solid",
    mute: true,
  },
  {
    name: "Ирина В.",
    role: "Clinic receptionist · formal, in a hurry",
    badge: "at B2",
    badgeTone: "locked" as const,
    image: "/assets/cast-maya.png",
    bg: "#CFE2E6",
    border: "solid",
    mute: true,
  },
] as const;

export function Cast() {
  return (
    <section id="cast" className="bg-paper-stepped">
      <div className="mx-auto max-w-[1280px] px-5 md:px-14">
        <div className="pt-14 pb-6 md:pt-16 md:pb-8">
          <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-ink/64 uppercase">
            Who you&apos;ll meet
          </p>
          <h2 className="mt-5 max-w-[780px] text-balance font-serif text-[34px] leading-[1.12] tracking-[-0.02em] md:text-[46px]">
            A whole family, opening one at a time as you get better.
          </h2>
        </div>

        <div className="grid gap-[18px] pb-14 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 md:pb-16">
          {CAST.map((person) => (
            <article
              key={person.name}
              className={`overflow-hidden rounded-[20px] bg-card ${
                person.border === "dashed"
                  ? "border border-dashed border-accent/50"
                  : "border border-ink/11 shadow-[0_12px_30px_-18px_rgba(35,31,24,0.28)]"
              }`}
            >
              <div className="relative" style={{ background: person.bg }}>
                <Image
                  src={person.image}
                  alt={person.name}
                  width={480}
                  height={600}
                  className={`h-auto w-full ${person.mute ? "saturate-[0.6]" : ""}`}
                />
                <span
                  className={`absolute bottom-3 left-3 rounded-full px-[10px] py-[7px] font-mono text-[9px] font-medium tracking-[0.1em] uppercase ${
                    person.badgeTone === "open"
                      ? "bg-accent text-paper"
                      : "bg-ink/78 text-paper"
                  }`}
                >
                  {person.badge}
                </span>
              </div>
              <div className="px-[18px] pt-5 pb-[22px]">
                <h3 className="font-serif text-[19px] leading-[1.25]">
                  {person.name}
                </h3>
                <p className="mt-[6px] text-pretty font-serif text-[14px] leading-[1.4] text-ink/64 italic">
                  {person.role}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
