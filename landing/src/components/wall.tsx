export function Wall() {
  return (
    <section className="grid gap-10 pb-[110px] md:grid-cols-[0.9fr_1.1fr] md:gap-16">
      <div>
        <p className="font-sans text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          The wall
        </p>
        <h2 className="mt-[18px] text-balance font-sans text-[34px] leading-[1.15] font-bold tracking-[-0.03em] md:text-[42px]">
          Two years of apps. Still silent in the room.
        </h2>
      </div>
      <div className="pt-[6px]">
        <p className="text-pretty font-sans text-[18px] leading-[1.7] text-nav md:text-[19px]">
          You know the grammar. Then someone asks you something across a
          table and nothing comes out — you have never had to answer in
          real time, with a real person waiting.
        </p>
        <p className="mt-5 text-pretty font-sans text-[18px] leading-[1.7] font-medium text-ink md:text-[19px]">
          What&apos;s missing is a low-stakes person who is always free. So
          we built a few, and gave them personalities, memories, and
          imperfect hearing.
        </p>
      </div>
    </section>
  );
}
