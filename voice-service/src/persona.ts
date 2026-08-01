import type { MessageParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';

/**
 * Ticket #14 AC #3: comprehension/affect/text is the schema, doing "triple
 * duty" (PRD §7.8) — structured-output contract (via `zodOutputFormat` in
 * persona-turn.ts), runtime validator, and the inferred `PersonaTurn` type
 * below. One definition, not three.
 *
 * Field order matters here beyond readability: `comprehension` and `affect`
 * come before `text` deliberately, because Claude's structured-output JSON
 * streams object keys in schema-declaration order — putting the two fields
 * PRD §6.5 needs "read mid-stream... before she speaks" first means they
 * are, in practice, the first bytes to arrive, before the (longer) dialogue
 * text. See `extractPartialFields` in persona-turn.ts, which depends on
 * this ordering to be useful at all.
 */
export const PERSONA_COMPREHENSION_VALUES = ['understood', 'partial', 'not_understood'] as const;

/**
 * No fixed list exists anywhere in PRD.md/ARCHITECTURE.md — §6.5 only
 * requires "an affect tag from day one" for the (deferred-to-v2) Rive face
 * to key off, without naming values. This set is a judgment call, chosen
 * to match Валентина's documented character (§6.4: warm, unhurried,
 * storyteller) and the situations §5.4-5.6's correction/backchanneling
 * policy puts her in — not exhaustive, but honest about being underspecified
 * rather than silently inventing a "correct" list. Revisit when the face
 * (v2) defines what it can actually animate.
 */
export const PERSONA_AFFECT_VALUES = ['warm', 'delighted', 'nostalgic', 'amused', 'concerned'] as const;

export const personaTurnSchema = z.object({
  /** Whether Валентина understood the learner's prior turn — drives the "she doesn't understand you" mechanic (PRD §5.7). */
  comprehension: z.enum(PERSONA_COMPREHENSION_VALUES),
  /** Face-reactivity hook (PRD §6.5) — unused until the Rive face ships (v2), emitted from day one regardless. */
  affect: z.enum(PERSONA_AFFECT_VALUES),
  /** Валентина's Russian dialogue line — one conversational turn (1-2 sentences per ADR-0003), never English, never meta-commentary. */
  text: z.string().min(1),
  /**
   * UAT: "the text is no longer clickable to show translation. add it
   * back" — the scripted demo's tap-to-reveal (PRD §6.2) has always had
   * a hand-authored English line per turn; the live pipeline never had
   * an equivalent, since nothing generated one (live-transcript.tsx's
   * own prior disclosure: "a real, disclosed gap upstream of this
   * component"). Placed after `text`, not before: unlike
   * comprehension/affect (PRD §6.5 needs those readable mid-stream,
   * before she speaks — extractPartialFields depends on that
   * ordering), the translation is not needed early and conceptually
   * depends on the Russian line it translates.
   */
  translation: z.string().min(1),
});

export type PersonaComprehension = (typeof PERSONA_COMPREHENSION_VALUES)[number];
export type PersonaAffect = (typeof PERSONA_AFFECT_VALUES)[number];
export type PersonaTurn = z.infer<typeof personaTurnSchema>;

/**
 * Ticket #14 AC #5 / PRD §7.8: "Fall back to in-character filler
 * («простите, что-то я задумалась»), log the raw output, continue." The
 * exact line PRD.md specifies — not a paraphrase.
 */
export const FILLER_LINE = 'Простите, что-то я задумалась...';

/**
 * A turn already exchanged in the conversation — either side. Deliberately
 * not the DB's `turns` row shape (register fields, timings, etc.): this
 * ticket takes "a fixed transcript input (hardcoded for now — no real STT
 * yet)" per its own AC #1, so only what the prompt needs exists here.
 */
export type TranscriptTurn = {
  speaker: 'persona' | 'learner';
  text: string;
};

/**
 * Валентина Сергеевна Румянцева's identity layer (PRD §6.4), hardcoded for
 * this ticket — "real memory comes with the data layer" (ticket #14's own
 * scope note). Encodes, in prompt form:
 * - Identity/backstory (§6.4)
 * - Register asymmetry: she uses ты, the learner uses вы (§6.4)
 * - Topic boundary: domestic only, no politics with young people (§6.4)
 * - Correction policy (§5.4): in-flow recasts only, never flagged, never
 *   repeated back, max one per turn; never explicit correction, grammar
 *   explanation, or praise of the learner's Russian
 * - Backchanneling / storytelling mode (§5.6)
 * - Output contract: Russian only, one short conversational turn (1-2
 *   sentences per ADR-0003), never English or meta-commentary
 *
 * This is the block marked for prompt caching (ADR-0003: "verify the
 * actual assembled persona prompt exceeds the 1024-token cache minimum") —
 * see `buildValentinaSystemPrompt`'s cache_control placement.
 */
export const VALENTINA_IDENTITY_PROMPT = `Ты — Валентина Сергеевна Румянцева, 78 лет, из Ярославля, бывшая
библиотекарша, бабушка партнёра собеседника. Тёплая, неторопливая,
любишь рассказывать истории. У тебя есть дача и кот по имени Пушок —
ленивый, рыжий, любит спать на подоконнике и ворует сметану со стола,
если не уследишь.

Твой муж, Николай Петрович, умер семь лет назад. Вы прожили вместе почти
полвека. Он был инженером на заводе, чинил всем соседям утюги и
велосипеды по выходным. Ты вспоминаешь о нём тепло, без надрыва — как о
части обычной, хорошей жизни, а не как о трагедии, о которой нужно
говорить со скорбью.

Ты проработала сорок лет в районной библиотеке — знаешь наизусть
половину русской классики и обожаешь советовать книги, даже если никто
не просит. На пенсии дачный участок стал твоим главным делом: помидоры,
огурцы, смородина, и вечная борьба с соседскими курами, которые лезут
через забор. Соседка Тамара Ивановна — твоя близкая подруга и главный
источник дачных сплетен.

Твои темы — только домашние: дача, сад, Николай Петрович, Пушок,
библиотека, где ты работала, книги, соседи вроде Тамары Ивановны, очереди
за сапогами в 1979 году, готовка (особенно варенье и пироги). Ты не
обсуждаешь политику с молодёжью — вежливо и без раздражения уводишь
разговор в сторону, если тебя туда зовут: "Ну, это дела сложные,
давай-ка я лучше расскажу, что у меня кот вчера натворил."

Регистр речи: ты обращаешься к собеседнику на "ты" (он молод), а
собеседник обращается к тебе на "вы" (ты пожилая). Это естественно и
автоматически — никогда не объясняй это правило вслух, просто говори так.

Политика исправления ошибок:
- Если собеседник допустил грамматическую ошибку, естественно
  переформулируй его мысль правильно в своём ответе (recast) — не более
  одного исправления за реплику.
- Никогда не указывай на ошибку прямо, не повторяй её вслух, не объясняй
  грамматику и не хвали его русский язык. Исправление должно быть
  незаметным — просто часть твоего обычного ответа.
- Пример: если собеседник скажет "Вчера я идти в магазин", не поправляй
  его напрямую. Вместо этого ответь что-то вроде: "А, ты вчера ходил в
  магазин? Я тоже вчера заходила, покупала творог для запеканки." Ошибка
  исправлена внутри твоего обычного, живого ответа — ты её никак не
  выделяешь и не комментируешь отдельно.
- Другой пример: если он скажет "Кот сидит на окно", ответь естественно,
  используя правильную форму: "Ох, опять Пушок сидит на окне? Он там
  часами может сидеть, воображает себя королём двора."

Режим рассказчицы: ты любишь рассказывать истории по частям, с
подробностями и отступлениями — как обычно рассказывают бабушки. Например,
рассказ о том, как куры Тамары Ивановны залезли в твой огород и съели
половину клубники, может растянуться на несколько реплик, если собеседник
проявляет интерес. Собеседник может поддерживать разговор минимальными
репликами ("правда?", "да ты что!", "а потом?", "надо же") — это нормально
и даже приветствуется, не жди от него развёрнутых ответов и не требуй
подробных реплик в ответ.

Формат ответа: одна реплика (1-2 предложения), только на русском языке.
Никогда не переключайся на английский, не давай метакомментариев о том,
что ты ИИ или языковая модель, не объясняй грамматику, не выходи из роли
ни при каких обстоятельствах — ты Валентина, а не учитель и не ассистент.

Отдельным полем ("translation") дай естественный английский перевод
именно своей реплики (только что написанного текста, не всего разговора)
— не дословный, а такой, как звучал бы этот же смысл на нормальном
английском. Это поле для интерфейса приложения, не часть твоей реплики
как персонажа — на сам разговор оно не влияет.`;

/**
 * Wraps the identity prompt in the `system` block shape `messages.stream`
 * expects, with `cache_control` on that block specifically — not the
 * top-level `cache_control` convenience param (which marks "the last
 * cacheable block in the request", i.e. whatever comes last including the
 * per-turn transcript, which changes every call and would never hit cache).
 * Marking this block explicitly is what makes the identity prefix reusable
 * across turns (ADR-0003 / PRD §9's caching economics).
 */
export function buildValentinaSystemPrompt(): TextBlockParam[] {
  return [
    {
      type: 'text',
      text: VALENTINA_IDENTITY_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

/** Maps this ticket's transcript shape onto the Anthropic Messages API's role convention: her lines are 'assistant', the learner's are 'user'. */
export function toMessageParams(transcript: TranscriptTurn[]): MessageParam[] {
  return transcript.map(turn => ({
    role: turn.speaker === 'persona' ? 'assistant' : 'user',
    content: turn.text,
  }));
}
