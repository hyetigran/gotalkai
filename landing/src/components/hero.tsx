"use client";

import Image from "next/image";
import { useState } from "react";
import { DisabledCta } from "./disabled-cta";
import { MicMeter } from "./mic-meter";

export function Hero() {
  const [showTranslation, setShowTranslation] = useState(false);

  return (
    <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:gap-14 md:py-[72px] md:pb-[76px]">
      <div>
        <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-ink/64 uppercase">
          Speak it out loud, every day
        </p>
        <h1 className="mt-[22px] font-serif text-[40px] leading-[1.06] tracking-[-0.03em] text-ink md:text-[62px]">
          You can read it.
          <br />
          Now <em className="text-accent italic">say</em> something.
        </h1>
        <p className="mt-[26px] max-w-[34rem] text-pretty font-sans text-[18px] leading-[1.6] text-ink/70 md:text-[20px]">
          Eight minutes a day on the phone with someone who remembers you.
          Валентина Сергеевна is 78, a retired librarian, and slightly deaf.
          She asks about your dog. She has never once given you a score.
        </p>

        <div className="mt-[34px] flex flex-wrap items-center gap-3.5">
          <DisabledCta>Call her tonight</DisabledCta>
          <button
            type="button"
            onClick={() => setShowTranslation((value) => !value)}
            className="rounded-[15px] border border-ink/22 px-7 py-5 font-serif text-[17px] text-ink transition-colors hover:border-ink/45 md:text-[19px]"
          >
            {showTranslation ? "Hide the translation" : "What did she say?"}
          </button>
        </div>

        <p className="mt-5 font-mono text-[12px] leading-relaxed text-ink/64">
          First week free · one 8-minute session a day · no streak to break ·
          iOS app, not a browser chat · coming soon
        </p>
      </div>

      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-30px_-24px] rounded-[34px] bg-[radial-gradient(120%_90%_at_66%_16%,rgba(160,84,58,0.15),rgba(160,84,58,0)_64%)]"
        />
        <div className="relative grid overflow-hidden rounded-[26px] border border-ink/11 bg-card shadow-[0_26px_64px_-22px_rgba(35,31,24,0.28)] md:grid-cols-[0.42fr_0.58fr]">
          <div className="relative min-h-[280px] bg-[#F0E4E4] md:min-h-[340px]">
            <Image
              src="/assets/cast-rosa.png"
              alt="Валентина Сергеевна"
              fill
              className="object-cover object-top"
              sizes="(max-width: 768px) 100vw, 280px"
              priority
            />
          </div>
          <div className="flex flex-col p-6 md:p-[26px]">
            <div className="flex items-center gap-[9px]">
              <span className="animate-lp-blink size-[7px] rounded-full bg-[#3E9C6D]" />
              <span className="font-mono text-[10px] font-medium tracking-[0.1em] text-ink/64 uppercase">
                on the line
              </span>
            </div>
            <p className="mt-4 font-serif text-[23px] leading-[1.15]">
              Валентина Сергеевна
            </p>
            <p className="mt-2 font-mono text-[12px] leading-[1.4] text-ink/64">
              78 · Ярославль · retired librarian
            </p>
            <div className="mt-[18px] flex-1 border-t border-ink/9 pt-[18px]">
              <p className="text-pretty font-serif text-[18px] leading-[1.45] md:text-[20px]">
                «Ну наконе́ц-то ты позвони́л. Ты говори́л, что соба́ка пропа́ла —
                нашла́сь?»
              </p>
              {showTranslation ? (
                <p className="animate-lp-rise mt-3 text-pretty font-sans text-[14px] leading-[1.5] text-ink/64">
                  Finally you called. You said the dog went missing — did she
                  turn up?
                </p>
              ) : null}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <div className="flex h-[42px] items-center justify-center rounded-full border border-accent/20 bg-accent/8 px-[15px]">
                <MicMeter height={28} />
              </div>
              <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-ink/64">
                your mic is open
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
