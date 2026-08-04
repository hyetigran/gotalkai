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
  { who: "her" as const, ru: "«Что-что? Погро́мче, я пло́хо слы́шу.»" },
  { who: "you" as const, ru: "В гараже́. Сосе́д нашёл её в гараже́." },
  {
    who: "her" as const,
    ru: "«Ах ты бо́же мой. У Ни́ны Петро́вны кот то́же так пря́тался.»",
  },
  { who: "you" as const, ru: "Пра́вда? Це́лую неде́лю?" },
] as const;

/**
 * Was "Your mic never closes... Interrupt her and she stops" in the
 * mockup — the open-mic design that copy describes was replaced (ticket
 * #40) after a real-device echo bug made it unfixable without acoustic
 * echo cancellation: her own TTS audio re-entering the mic read as a
 * false interruption. Rewritten to describe what actually ships —
 * press-and-hold, no barge-in — rather than shipping marketing copy the
 * app itself would immediately contradict.
 */
export function OneRealDecision() {
  const [liveN, setLiveN] = useState(4);
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let replyTimer: number | undefined;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const next = liveN >= LIVE.length ? 4 : liveN + 1;
      const isHer = LIVE[next - 1]?.who === "her";
      if (isHer && next !== 4) {
        setReplying(true);
        replyTimer = window.setTimeout(() => {
          if (cancelled) return;
          setReplying(false);
          setLiveN(next);
        }, 900);
      } else {
        setLiveN(next);
        setReplying(false);
      }
    }, 2400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (replyTimer) window.clearTimeout(replyTimer);
    };
  }, [liveN]);

  const end = Math.max(4, liveN);
  const visible = LIVE.slice(end - 4, end);

  return (
    <section className="pt-24 md:pt-24">
      <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(140deg,#5B4FD6_0%,#4A5FC4_100%)] px-7 py-14 text-white md:px-14 md:py-[60px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[60px] -right-10 size-[280px] rounded-full bg-[radial-gradient(circle,rgba(255,200,87,0.28),rgba(255,200,87,0)_70%)]"
        />
        <div className="relative grid items-center gap-14 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div>
            <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-white/72 uppercase">
              The one real decision
            </p>
            <h2 className="mt-[18px] text-balance font-sans text-[34px] leading-[1.15] font-bold tracking-[-0.03em] md:text-[40px]">
              Hold the button. Let go when you&apos;re done.
            </h2>
            <p className="mt-[18px] text-pretty font-sans text-[18px] leading-[1.7] text-white/84">
              Press and hold while you talk, same as raising your hand
              before you speak — not fighting a mic for the floor. Let go,
              and she starts thinking about what you said.
            </p>
            <p className="mt-4 text-pretty font-sans text-[18px] leading-[1.7] text-white/84">
              That means no awkward false starts from a mic that thought
              you were finished, and no talking over each other. The
              tradeoff: you can&apos;t jump in mid-sentence yet. That&apos;s
              next.
            </p>
          </div>
          <div className="flex flex-col gap-[14px] rounded-[24px] border border-white/20 bg-white/10 px-[26px] pt-[26px] pb-[22px]">
            <div
              className="flex h-[284px] flex-col justify-end gap-[14px] overflow-hidden"
              style={{
                maskImage: "linear-gradient(to bottom, transparent 0, #000 26px)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0, #000 26px)",
              }}
            >
              {visible.map((turn, index) => (
                <p
                  key={`${turn.ru}-${index}`}
                  className={`animate-lg-slide m-0 text-pretty font-sans ${
                    turn.who === "her"
                      ? "text-left text-[17px] leading-[1.5] font-medium text-white"
                      : "text-right text-[15px] leading-[1.5] text-white/62"
                  }`}
                  style={{ opacity: [0.36, 0.52, 0.74, 1][index] }}
                >
                  {turn.ru}
                </p>
              ))}
            </div>
            <div className="mt-[6px] flex items-center gap-[11px] border-t border-white/18 pt-4">
              <div className="flex h-[38px] items-center justify-center rounded-full bg-white/12 px-[13px]">
                <MicMeter variant="gold-on-dark" height={22} />
              </div>
              <span className="font-sans text-[11px] font-medium text-white/80">
                {replying ? "she's replying" : "hold to talk"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
