"use client";

import Image from "next/image";
import { useState } from "react";
import { DisabledCta } from "./disabled-cta";
import { MicMeter } from "./mic-meter";

const STICKERS = [
  { label: "¡Hola!", top: 10, left: 0, bg: "#4490E2", rotate: -7, dur: 5.4, delay: 0 },
  { label: "Bonjour!", top: 78, left: -6, bg: "#8A5CE7", rotate: 5, dur: 6.2, delay: 0.7 },
  { label: "안녕!", top: 124, left: 190, bg: "#FF6B9D", rotate: 6, dur: 5.8, delay: 0.5 },
] as const;

export function Hero() {
  const [showTranslation, setShowTranslation] = useState(false);

  return (
    <section className="pb-24 md:pb-28">
      <div className="relative overflow-hidden rounded-[36px] bg-[linear-gradient(150deg,#7B5FE8_0%,#5B62D8_42%,#3F51BE_100%)] shadow-[0_40px_90px_-34px_rgba(60,46,170,0.72),inset_0_1px_0_rgba(255,255,255,0.22)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_620px_at_88%_8%,rgba(160,120,255,0.55)_0%,rgba(160,120,255,0)_62%),radial-gradient(760px_520px_at_4%_96%,rgba(72,196,255,0.32)_0%,rgba(72,196,255,0)_60%)]"
        />
        <div className="relative grid gap-10 px-6 pt-12 pb-0 md:grid-cols-[minmax(0,1fr)_298px] md:items-end md:gap-14 md:px-[52px] md:pt-[74px]">
          <div className="max-w-[660px] pb-10 md:pb-[76px]">
            <div className="inline-flex items-center gap-[9px] rounded-full border border-white/26 bg-white/16 px-[15px] py-[9px]">
              <span className="animate-lg-pulse block size-[7px] shrink-0 rounded-full bg-[#4CD964]" />
              <span className="font-sans text-[12px] font-semibold tracking-[0.06em] text-white uppercase">
                Speaking practice · 8 min a day
              </span>
            </div>
            <h1 className="mt-6 text-balance font-sans text-[40px] leading-[1.06] font-bold tracking-[-0.03em] text-white [text-shadow:0_2px_30px_rgba(30,18,90,0.28)] md:text-[64px] md:tracking-[-0.04em]">
              Learn languages. Open the world.
            </h1>
            <p className="mt-[22px] max-w-[540px] text-pretty font-sans text-[18px] leading-[1.65] text-white/88 md:text-[19px]">
              Eight minutes a day on the phone with someone who remembers
              you. They ask about your dog, your week, your terrible
              neighbour — and they never once give you a score.
            </p>

            <div className="mt-[30px] flex flex-wrap items-center gap-[13px]">
              <DisabledCta variant="gold">Start speaking free</DisabledCta>
              <button
                type="button"
                onClick={() => setShowTranslation((value) => !value)}
                className="rounded-full border-[1.5px] border-white/40 px-7 py-[18px] font-sans text-[17px] font-semibold text-white transition-colors hover:border-white"
              >
                {showTranslation ? "Hide the translation" : "What did she say?"}
              </button>
            </div>

            <p className="mt-5 font-sans text-[13px] leading-[1.6] text-white/66">
              First week free · no streaks · cancel in two taps
            </p>
          </div>

          <div className="flex flex-col gap-[14px] pb-10 md:pb-0">
            <div
              aria-hidden="true"
              className="relative hidden h-[172px] w-[298px] md:block"
            >
              {STICKERS.map((sticker) => (
                <span
                  key={sticker.label}
                  className="animate-lg-float absolute rounded-[100px_100px_100px_6px] px-[18px] py-3 font-sans text-[15px] font-semibold text-white"
                  style={
                    {
                      top: sticker.top,
                      left: sticker.left,
                      background: sticker.bg,
                      "--r": `${sticker.rotate}deg`,
                      "--float-dur": `${sticker.dur}s`,
                      "--float-delay": `${sticker.delay}s`,
                    } as React.CSSProperties
                  }
                >
                  {sticker.label}
                </span>
              ))}
              <span
                className="animate-lg-float absolute top-0 left-[152px] flex size-[44px] items-center justify-center rounded-[100px_100px_100px_8px] bg-[#FFC857] font-sans text-[17px] font-semibold text-[#3B2E00]"
                style={{ "--r": "8deg", "--float-dur": "5s", "--float-delay": "0.3s" } as React.CSSProperties}
              >
                あ
              </span>
              <span
                className="animate-lg-float absolute top-[62px] left-[252px] flex size-[42px] items-center justify-center rounded-[100px_100px_100px_8px] bg-card font-sans text-[16px] font-semibold text-accent-deep"
                style={{ "--r": "-6deg", "--float-dur": "6.8s", "--float-delay": "1.1s" } as React.CSSProperties}
              >
                文
              </span>
              <span
                className="animate-lg-twinkle absolute top-[54px] left-[106px] size-[22px] bg-[#FFC857] [clip-path:polygon(50%_0,61%_39%,100%_50%,61%_61%,50%_100%,39%_61%,0_50%,39%_39%)]"
              />
              <span
                className="animate-lg-twinkle absolute top-[132px] left-[58px] size-[14px] bg-[#FFC857] [clip-path:polygon(50%_0,61%_39%,100%_50%,61%_61%,50%_100%,39%_61%,0_50%,39%_39%)]"
                style={{ animationDelay: "0.8s" }}
              />
            </div>

            <div className="relative z-[2] w-full rounded-[20px_20px_6px_20px] bg-card p-[17px_19px] shadow-[0_22px_48px_-14px_rgba(24,14,80,0.62)] md:w-[298px]">
              <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">
                Valentina · on the line
              </p>
              <p
                key={showTranslation ? "en" : "ru"}
                className="animate-lg-slide mt-[9px] text-pretty font-sans text-[15px] leading-[1.5] font-medium text-ink"
              >
                {showTranslation
                  ? "Finally! You said the dog had run off — did you find her?"
                  : "«Ну наконе́ц-то! Ты же говори́л, соба́ка убежа́ла — нашли́?»"}
              </p>
              <div className="mt-[14px] flex items-center gap-[10px]">
                <div className="flex h-[38px] items-center justify-center rounded-full bg-tint px-[13px]">
                  <MicMeter height={26} />
                </div>
                <span className="font-sans text-[11px] font-medium text-body">
                  hold to talk
                </span>
              </div>
            </div>

            <div className="relative hidden w-[298px] overflow-hidden rounded-t-[26px] bg-[#2B4BBD] shadow-[0_-10px_44px_-10px_rgba(20,14,70,0.55)] md:block">
              <Image
                src="/assets/lingo-group2.png"
                alt="Your conversation partners"
                width={298}
                height={275}
                className="block"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
