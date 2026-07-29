import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { PersonaTurn } from '../persona';
import type { GoldenEntry } from './golden-set-types';

/**
 * Ticket #28 AC #4: "Frontier-model judge scoring exactly three
 * dimensions: grammaticality, recast quality, register/character —
 * nothing else." Kept to exactly these three numeric fields — no
 * rationale/free-text field — matching that "nothing else" literally,
 * even though a rationale would help debugging; PRD §10 frames the whole
 * point of a tight rubric as avoiding exactly this kind of scope creep
 * ("Schema compliance rarely fails, which is why it is a misleading thing
 * to test on" — the judge is deliberately narrow for the same reason).
 * 1-5 scale to match the gates' own thresholds (PRD §10: "≥ 4.3", "≥ 4.0").
 */
export const judgeScoreSchema = z.object({
  grammaticality: z.number().int().min(1).max(5),
  recastQuality: z.number().int().min(1).max(5),
  registerCharacter: z.number().int().min(1).max(5),
});

export type JudgeScore = z.infer<typeof judgeScoreSchema>;

/**
 * A different, stronger model than the one being evaluated (ADR-0003:
 * Claude Sonnet 5 generates persona turns) — judged models scoring
 * themselves is a known bias risk in eval design. Not specified by
 * PRD.md/ARCHITECTURE.md ("frontier model" is the only constraint) — a
 * documented judgment call, see docs/adr/0012.
 */
const JUDGE_MODEL = 'claude-opus-5';

function buildJudgePrompt(entry: GoldenEntry, turn: PersonaTurn): string {
  return `Ты оцениваешь ответ русскоязычного ИИ-персонажа (Валентина, 78-летняя пенсионерка) в разговоре с изучающим русский язык.

История разговора (для контекста, не оценивай её):
${entry.history.map(t => `${t.speaker === 'persona' ? 'Валентина' : 'Изучающий'}: ${t.text}`).join('\n')}

Реплика изучающего, на которую отвечает Валентина:
"${entry.learnerTurn}"

Ответ Валентины (оцени именно его):
"${turn.text}"

${entry.shouldRecast && entry.erroneousSpan ? `В реплике изучающего есть ошибка ("${entry.erroneousSpan}"), которую хороший ответ должен естественно исправить (recast) — не указывая на неё прямо.` : 'В реплике изучающего нет ошибки, которую нужно исправлять.'}

Оцени ответ Валентины по трём измерениям, каждое от 1 до 5:
- grammaticality: грамматическая правильность её собственной русской речи.
- recastQuality: качество естественного исправления ошибки изучающего внутри ответа (если ошибки не было — оцени как 5, если ответ корректно не стал ничего "исправлять").
- registerCharacter: соответствует ли ответ характеру Валентины (тёплая, использует "ты", не хвалит русский язык изучающего, не объясняет грамматику явно).`;
}

/**
 * Ticket #28 AC #4. Non-streaming (`client.messages.parse`, not
 * `.stream`) — a judge score has no mid-stream-reactivity requirement the
 * way `generatePersonaTurn` (ticket #14) does, so the simpler one-shot
 * structured-output call is the right tool here, not the more complex
 * streaming path.
 *
 * Throws on failure (malformed judge output, network error) rather than
 * silently falling back the way `generatePersonaTurn` does — there is no
 * safe "filler score," and `run-eval.ts` treats a missing judge score as
 * a hole in the report to surface loudly, not something to paper over
 * with a fabricated number.
 */
export async function judgeTurn(client: Anthropic, entry: GoldenEntry, turn: PersonaTurn): Promise<JudgeScore> {
  const message = await client.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: buildJudgePrompt(entry, turn) }],
    output_config: { format: zodOutputFormat(judgeScoreSchema) },
  });
  if (!message.parsed_output)
    throw new Error(`judge produced no parsed output for entry ${entry.id}`);
  return message.parsed_output;
}
