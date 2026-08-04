const ABSENT = [
  "streaks",
  "XP",
  "daily goals",
  "badges",
  "leaderboards",
  "accuracy %",
  "hearts",
  "combos",
  "leagues",
] as const;

const PATTERNS = [
  {
    n: "1",
    title: "Мы иска́ли, not мы и́щем.",
    body: "Past narration came up four times. Twice she had to ask what you meant.",
    dot: "#6C5CE7",
  },
  {
    n: "2",
    title: "в гараже́, not в гара́ж.",
    body: "Location after в takes the prepositional.",
    dot: "#4490E2",
  },
  {
    n: "3",
    title: "Stress: нашла́сь, not на́шлась.",
    body: "Recurred across three turns. She worked it out from context.",
    dot: "#26C6DA",
  },
] as const;

export function Pillars() {
  return (
    <section className="grid items-stretch gap-[22px] pt-24 md:grid-cols-2">
      <article className="flex flex-col rounded-[28px] bg-band px-9 py-[38px]">
        <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          What we left out
        </p>
        <h3 className="mt-4 text-balance font-sans text-[30px] leading-[1.18] font-bold tracking-[-0.025em]">
          No streak. No score. Nothing to lose.
        </h3>
        <p className="mt-[14px] text-pretty font-sans text-[16px] leading-[1.65] text-nav">
          A streak turns a missed Tuesday into failure. A score turns a
          conversation into a test. You get one honest number instead: how
          often they understood you.
        </p>
        <div className="mt-6 flex flex-wrap gap-[9px]">
          {ABSENT.map((label) => (
            <span
              key={label}
              className="rounded-full border-[1.5px] border-line bg-card px-[15px] py-[10px] font-sans text-[14px] font-medium text-muted line-through decoration-[#FF6B9D] decoration-[1.5px]"
            >
              {label}
            </span>
          ))}
        </div>
      </article>

      <article className="flex flex-col rounded-[28px] border-[1.5px] border-line bg-card px-9 py-[38px] shadow-[0_18px_44px_-26px_var(--sh)]">
        <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          Afterwards
        </p>
        <h3 className="mt-4 text-balance font-sans text-[30px] leading-[1.18] font-bold tracking-[-0.025em]">
          Three things worth fixing. Not thirty.
        </h3>
        <p className="mt-5 font-sans text-[27px] leading-[1.3] font-semibold tracking-[-0.02em]">
          They understood you <span className="text-accent">11 of 14</span>.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {PATTERNS.map((pattern) => (
            <div key={pattern.n} className="flex items-start gap-[13px]">
              <span
                className="mt-[2px] flex size-6 shrink-0 items-center justify-center rounded-full font-sans text-[12px] font-bold text-white"
                style={{ background: pattern.dot }}
              >
                {pattern.n}
              </span>
              <div>
                <p className="font-sans text-[16px] leading-[1.4] font-semibold">
                  {pattern.title}
                </p>
                <p className="mt-1 text-pretty font-sans text-[14px] leading-[1.55] text-body">
                  {pattern.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
