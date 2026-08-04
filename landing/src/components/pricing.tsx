import { DisabledCta } from "./disabled-cta";

const LIMITS = [
  {
    title: "They are not tutors.",
    body: "No grammar explanations on demand. If you want the rules taught, get a textbook — then come here to use them.",
  },
  {
    title: "They are software.",
    body: "They will occasionally say something a real person never would. Tell us when they do.",
  },
  {
    title: "One language at a time.",
    body: "Russian is finished and live today. Each new one gets its own cast, written by people who speak it — which takes months, not a model swap.",
  },
] as const;

export function Pricing() {
  return (
    <section
      id="price"
      className="grid items-center gap-16 px-5 pt-24 md:grid-cols-2 md:px-14"
    >
      <div>
        <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          Pricing
        </p>
        <h2 className="mt-[18px] font-sans text-[44px] leading-[1.08] font-bold tracking-[-0.035em] md:text-[54px]">
          $12 a month.
        </h2>
        <p className="mt-5 max-w-[32rem] text-pretty font-sans text-[18px] leading-[1.7] text-nav">
          One session a day, every day — the pedagogically correct amount,
          not a paywall trick. About a fifth of one hour with a tutor.
        </p>
        <div className="mt-8">
          <DisabledCta>Start the first week free</DisabledCta>
        </div>
        <p className="mt-[18px] font-sans text-[13px] leading-relaxed text-muted">
          Cancel in two taps · iOS first, Android later this year
        </p>
      </div>

      <div className="rounded-[28px] bg-band px-9 py-9">
        <p className="font-sans text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Honest limits
        </p>
        <div className="mt-[22px] flex flex-col gap-[18px]">
          {LIMITS.map((limit) => (
            <div key={limit.title}>
              <h3 className="font-sans text-[17px] leading-[1.35] font-semibold">
                {limit.title}
              </h3>
              <p className="mt-[5px] text-pretty font-sans text-[14px] leading-[1.6] text-body">
                {limit.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
