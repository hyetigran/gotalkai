const STEPS = [
  {
    n: "1",
    title: "They open",
    body: "No blank page. They call out something from last time — the dog, the cat, your unreliable neighbour.",
    color: "#6C5CE7",
  },
  {
    n: "2",
    title: "You talk",
    body: "Hold the button while you talk. Fumble, and they ask you to say it again — they genuinely didn't catch it.",
    color: "#4490E2",
  },
  {
    n: "3",
    title: "They tell you",
    body: "Three patterns, ranked by what got in the way of being understood — plus what you steered around.",
    color: "#26C6DA",
  },
  {
    n: "4",
    title: "Tomorrow",
    body: "Same scene, one notch harder — the cat is ill, and they want it in the tense you avoided today.",
    color: "#4CD964",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="pt-24 md:pt-24">
      <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
        How a session goes
      </p>
      <h2 className="mt-[18px] max-w-[620px] text-balance font-sans text-[34px] leading-[1.15] font-bold tracking-[-0.03em] md:text-[42px]">
        Eight minutes, four beats, no homework.
      </h2>

      <div className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <article
            key={step.n}
            className="rounded-[24px] border-[1.5px] border-line bg-card px-[26px] pt-[30px] pb-8 shadow-[0_14px_36px_-24px_var(--sh)]"
          >
            <div
              className="flex size-11 items-center justify-center rounded-[14px] font-sans text-[19px] font-bold text-white"
              style={{ background: step.color }}
            >
              {step.n}
            </div>
            <h3 className="mt-5 font-sans text-[20px] leading-[1.25] font-semibold tracking-[-0.01em]">
              {step.title}
            </h3>
            <p className="mt-[11px] text-pretty font-sans text-[14px] leading-[1.65] text-body">
              {step.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
