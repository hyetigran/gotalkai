"use client";

import { useEffect, useState } from "react";
import { MicMeter } from "./mic-meter";

const LIVE = [
  {
    who: "her" as const,
    ru: "«Ну наконе́ц-то ты позвони́л! Так что с соба́кой-то?»",
  },
  { who: "you" as const, ru: "Да, соба́ка… она́ до́ма. Мы иска́ем два дня." },
  {
    who: "her" as const,
    ru: "«Два дня иска́ли! Ох, я представля́ю. И кто её нашёл?»",
  },
  { who: "you" as const, ru: "Сосе́д нашёл. Он… как сказа́ть… в гара́ж." },
  {
    who: "her" as const,
    ru: "«Что-что? Погро́мче, я пло́хо слы́шу.»",
  },
  { who: "you" as const, ru: "В гараже́. Сосе́д нашёл её в гараже́." },
  {
    who: "her" as const,
    ru: "«Ах ты бо́же мой. У Ни́ны Петро́вны кот то́же так пря́тался.»",
  },
  { who: "you" as const, ru: "Пра́вда? Це́лую неде́лю?" },
];

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
    n: "01",
    title: "Мы иска́ли, not мы и́щем.",
    body: "Past narration came up four times. Twice she had to ask what you meant.",
  },
  {
    n: "02",
    title: "в гараже́, not в гара́ж.",
    body: "Location after в takes the prepositional.",
  },
  {
    n: "03",
    title: "Stress: нашла́сь, not на́шлась.",
    body: "Recurred across three turns. She worked it out from context.",
  },
] as const;

export function Pillars() {
  const [liveN, setLiveN] = useState(4);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let thinkTimer: number | undefined;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const next = liveN >= LIVE.length ? 4 : liveN + 1;
      const isHer = LIVE[next - 1]?.who === "her";
      if (isHer && next !== 4) {
        setThinking(true);
        thinkTimer = window.setTimeout(() => {
          if (cancelled) return;
          setThinking(false);
          setLiveN(next);
        }, 900);
      } else {
        setLiveN(next);
        setThinking(false);
      }
    }, 2400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (thinkTimer) window.clearTimeout(thinkTimer);
    };
  }, [liveN]);

  const end = Math.max(4, liveN);
  const visible = LIVE.slice(end - 4, end);

  return (
    <section className="mx-auto grid max-w-[1280px] gap-[22px] px-5 py-16 md:grid-cols-3 md:px-14 md:py-28">
      <article className="flex flex-col rounded-[24px] bg-ink px-8 py-[34px] text-paper">
        <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-paper/62 uppercase">
          The one real decision
        </p>
        <h3 className="mt-4 text-balance font-serif text-[28px] leading-[1.15] tracking-[-0.02em] md:text-[30px]">
          Your mic never closes.
        </h3>
        <p className="mt-[14px] text-pretty font-sans text-[16px] leading-[1.6] text-paper/78">
          No button to hold before you&apos;re allowed to speak. Interrupt her
          and she stops. Say{" "}
          <em className="italic">пра́вда?</em> mid-story and she hears it and
          carries on.
        </p>
        <div className="mt-[22px] flex flex-1 flex-col justify-end gap-3 border-t border-paper/14 pt-5">
          {visible.map((turn, index) => (
            <p
              key={`${turn.ru}-${index}`}
              className={`animate-lp-slide m-0 text-pretty font-serif ${
                turn.who === "her"
                  ? "text-left text-[18px] leading-[1.5] text-paper"
                  : "text-right text-[15px] leading-[1.45] text-paper/56"
              }`}
              style={{ opacity: [0.34, 0.5, 0.72, 1][index] }}
            >
              {turn.ru}
            </p>
          ))}
        </div>
        <div className="mt-[18px] flex items-center gap-[11px]">
          <div className="flex h-[38px] items-center justify-center rounded-full border border-paper/18 bg-paper/7 px-[13px]">
            <MicMeter variant="dark" height={22} />
          </div>
          <span className="font-mono text-[10px] font-medium tracking-[0.04em] text-paper/72">
            {thinking ? "thinking — 780ms" : "mic open"}
          </span>
        </div>
      </article>

      <article className="flex flex-col rounded-[24px] bg-paper-stepped px-8 py-[34px]">
        <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink/64 uppercase">
          What we left out
        </p>
        <h3 className="mt-4 text-balance font-serif text-[28px] leading-[1.15] tracking-[-0.02em] md:text-[30px]">
          No streak. No score. Nothing to lose.
        </h3>
        <p className="mt-[14px] text-pretty font-sans text-[16px] leading-[1.6] text-ink/70">
          A streak turns a missed Tuesday into failure. A score turns a
          conversation into a test. You get one honest number instead: how
          often she understood you.
        </p>
        <div className="mt-[22px] flex flex-wrap gap-2">
          {ABSENT.map((label, index) => (
            <span
              key={label}
              className="animate-lp-rise rounded-full border border-ink/16 bg-paper/50 px-[15px] py-[11px] font-serif text-[16px] text-ink/64 line-through decoration-accent/55 decoration-[1.5px]"
              style={{ animationDelay: `${(index * 0.05).toFixed(2)}s` }}
            >
              {label}
            </span>
          ))}
        </div>
      </article>

      <article className="flex flex-col rounded-[24px] border border-ink/11 bg-card px-8 py-[34px] shadow-[0_12px_36px_-18px_rgba(35,31,24,0.18)]">
        <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink/64 uppercase">
          Afterwards
        </p>
        <h3 className="mt-4 text-balance font-serif text-[28px] leading-[1.15] tracking-[-0.02em] md:text-[30px]">
          Three things worth fixing. Not thirty.
        </h3>
        <p className="mt-[18px] font-serif text-[26px] leading-[1.3] tracking-[-0.01em]">
          She understood you <span className="text-accent">11 of 14</span>.
        </p>
        <div className="mt-5 flex flex-col gap-[11px]">
          {PATTERNS.map((pattern) => (
            <div
              key={pattern.n}
              className="flex gap-3 border-t border-ink/10 pt-[13px]"
            >
              <span className="shrink-0 font-mono text-[10px] font-medium leading-[1.5] text-ink/64">
                {pattern.n}
              </span>
              <div>
                <p className="font-serif text-[17px] leading-[1.35]">
                  {pattern.title}
                </p>
                <p className="mt-[5px] text-pretty font-sans text-[14px] leading-[1.5] text-ink/64">
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
