import { WaitlistForm } from "./waitlist-form";

const LIMITS = [
  {
    title: "She is not a tutor.",
    body: "No grammar explanations on demand. If you want the rules taught, get a textbook — then come here to use them.",
  },
  {
    title: "She is software.",
    body: "She will occasionally say something a real 78-year-old librarian never would. Tell us when she does.",
  },
  {
    title: "One language at a time.",
    body: "Russian is finished and live today. Each new language gets its own cast, written by people who speak it.",
  },
] as const;

export function Pricing() {
  return (
    <section
      id="price"
      className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-8 md:grid-cols-2 md:gap-[72px] md:px-14"
    >
      <div>
        <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-ink/64 uppercase">
          Price
        </p>
        <h2 className="mt-5 font-serif text-[44px] leading-[1.08] tracking-[-0.03em] md:text-[56px]">
          $12 a month.
        </h2>
        <p className="mt-6 max-w-[32rem] text-pretty font-sans text-[18px] leading-[1.65] text-ink/70 md:text-[20px]">
          One session a day, every day — the pedagogically correct amount, not
          a paywall trick. About a fifth of one hour with a tutor.
        </p>
        <div className="mt-[34px]">
          <WaitlistForm
            id="price-waitlist"
            ctaLabel="Start the first week free"
          />
        </div>
        <p className="mt-[18px] font-mono text-[12px] leading-relaxed text-ink/64">
          Cancel in two taps · iOS first, Android later this year · not a web
          conversation client
        </p>
      </div>

      <div className="rounded-[24px] bg-paper-stepped px-[34px] py-9">
        <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-ink/64 uppercase">
          Honest limits
        </p>
        <div className="mt-[22px] flex flex-col gap-[18px]">
          {LIMITS.map((limit) => (
            <div key={limit.title}>
              <h3 className="font-serif text-[19px] leading-[1.35]">
                {limit.title}
              </h3>
              <p className="mt-[6px] text-pretty font-sans text-[15px] leading-[1.55] text-ink/64">
                {limit.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
