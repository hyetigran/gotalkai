"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const EXPRESSIONS = [
  {
    key: "idle",
    label: "Idle",
    caption:
      "Waiting, breathing, blinking. She never freezes between turns.",
    src: "/assets/expr-0-idle.png",
  },
  {
    key: "blink",
    label: "Blink",
    caption:
      "Involuntary, irregular. The cheapest signal that she is alive.",
    src: "/assets/expr-1-blink.png",
  },
  {
    key: "listening",
    label: "Listening",
    caption: "Head tilts in while you are still finding the word.",
    src: "/assets/expr-2-listening.png",
  },
  {
    key: "speaking",
    label: "Speaking",
    caption: "Mouth shapes track the audio, so her voice has a source.",
    src: "/assets/expr-3-speaking.png",
  },
  {
    key: "surprised",
    label: "Surprised",
    caption: "She did not catch that. Now you know before she asks.",
    src: "/assets/expr-4-surprised.png",
  },
  {
    key: "smile",
    label: "Smile",
    caption: "You got there. Warmth, not a green tick.",
    src: "/assets/expr-5-smile.png",
  },
] as const;

export function Expressions() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const current = EXPRESSIONS[index];

  useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(() => {
      setIndex((value) => (value + 1) % EXPRESSIONS.length);
    }, 1700);
    return () => window.clearTimeout(timer);
  }, [auto, index]);

  return (
    <section className="mx-auto max-w-[1280px] px-5 py-16 md:px-14 md:py-[76px]">
      <div className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-12 text-paper md:px-[60px] md:py-[60px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_88%_10%,rgba(160,84,58,0.36),rgba(160,84,58,0)_70%)]"
        />
        <div className="relative grid items-center gap-12 md:grid-cols-[1fr_260px] md:gap-16">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-paper/62 uppercase">
              Everyone has a face
            </p>
            <h2 className="mt-[18px] text-balance font-serif text-[32px] leading-[1.12] tracking-[-0.02em] md:text-[44px]">
              Маша leans in while you&apos;re still finding the word.
            </h2>
            <p className="mt-5 max-w-[36rem] text-pretty font-sans text-[17px] leading-[1.65] text-paper/78 md:text-[19px]">
              Every character is animated, and every turn carries an expression
              — they lean in when they didn&apos;t catch you, soften when you
              get there, laugh when you&apos;re funny by accident. That&apos;s
              the difference between a voice and a person.
            </p>
            <div className="mt-[26px] flex gap-2">
              {EXPRESSIONS.map((expression, expressionIndex) => (
                <button
                  key={expression.key}
                  type="button"
                  aria-label={expression.label}
                  onClick={() => {
                    setIndex(expressionIndex);
                    setAuto(false);
                  }}
                  className={`h-[9px] rounded-full transition-all ${
                    expressionIndex === index
                      ? "w-[26px] bg-[#E4A184]"
                      : "w-[9px] bg-paper/28"
                  }`}
                />
              ))}
            </div>
            <p className="mt-5 font-mono text-[12px] leading-relaxed text-paper/62">
              Built in Rive · 60 fps · eyes, mouth, breath
            </p>
          </div>

          <div className="justify-self-center rounded-[34px] border border-paper/14 bg-[#0F0D0A] p-[9px] shadow-[0_22px_50px_-18px_rgba(0,0,0,0.6)]">
            <div className="relative w-[242px] overflow-hidden rounded-[26px] bg-paper text-ink">
              <div className="flex h-[26px] items-center justify-center">
                <div className="h-[5px] w-[58px] rounded-full bg-ink/18" />
              </div>
              <div className="relative h-[250px] overflow-hidden bg-[#F4F0E8]">
                {EXPRESSIONS.map((expression, expressionIndex) => (
                  <Image
                    key={expression.key}
                    src={expression.src}
                    alt={expression.label}
                    width={198}
                    height={273}
                    className={`absolute top-[34px] left-1/2 ml-[-99px] transition-opacity duration-300 ${
                      expressionIndex === index ? "opacity-100" : "opacity-0"
                    }`}
                  />
                ))}
              </div>
              <div className="px-4 pt-[15px] pb-[18px]">
                <div className="flex items-baseline justify-between gap-[10px]">
                  <span className="font-mono text-[9px] font-medium tracking-[0.12em] text-accent uppercase">
                    {current.label}
                  </span>
                  <span className="font-serif text-[12px] text-ink/64 italic">
                    Маша
                  </span>
                </div>
                <p className="mt-[9px] min-h-[68px] text-pretty font-serif text-[16px] leading-[1.4]">
                  {current.caption}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
