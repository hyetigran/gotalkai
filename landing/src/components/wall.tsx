export function Wall() {
  return (
    <section className="grid gap-10 pb-24 md:grid-cols-[0.95fr_1.05fr] md:gap-[72px] md:pb-28">
      <div>
        <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-ink/64 uppercase">
          The wall
        </p>
        <h2 className="mt-5 text-balance font-serif text-[34px] leading-[1.12] tracking-[-0.02em] md:text-[46px]">
          Two years of apps. Still silent in the room.
        </h2>
      </div>
      <div className="md:pt-2">
        <p className="text-pretty font-sans text-[18px] leading-[1.65] text-ink/74 md:text-[21px]">
          You know the grammar. Then someone asks you something across a table
          and nothing comes out — you have never had to answer in real time,
          with a real person waiting.
        </p>
        <p className="mt-6 text-pretty font-serif text-[18px] leading-[1.65] text-ink md:text-[21px]">
          <strong className="font-bold">
            What&apos;s missing is a low-stakes person who is always free.
          </strong>{" "}
          So we built one, and gave her a personality, a memory, and a bad ear.
        </p>
      </div>
    </section>
  );
}
