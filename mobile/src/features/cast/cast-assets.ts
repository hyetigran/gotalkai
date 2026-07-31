/**
 * Persona portrait + Valentina expression assets for Open, Address Book,
 * and Converse. Filenames use product ids; CHARACTER.md / landing art maps
 * Rosa→valentina, Maria→elena, Sofia→masha, Marco→dima, Maya→irina.
 */

export type CastId = 'valentina' | 'elena' | 'masha' | 'dima' | 'irina';

export type ValentinaExpression =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'surprised'
  | 'smile';

export const CAST_PORTRAITS: Record<CastId, number> = {
  valentina: require('../../../assets/cast/valentina.png'),
  elena: require('../../../assets/cast/elena.png'),
  masha: require('../../../assets/cast/masha.png'),
  dima: require('../../../assets/cast/dima.png'),
  irina: require('../../../assets/cast/irina.png'),
};

export const VALENTINA_EXPRESSIONS: Record<ValentinaExpression, number> = {
  idle: require('../../../assets/expressions/valentina/idle.png'),
  listening: require('../../../assets/expressions/valentina/listening.png'),
  speaking: require('../../../assets/expressions/valentina/speaking.png'),
  thinking: require('../../../assets/expressions/valentina/thinking.png'),
  surprised: require('../../../assets/expressions/valentina/surprised.png'),
  smile: require('../../../assets/expressions/valentina/smile.png'),
};

export type ExpressionContext = {
  affect?: string;
  comprehension?: string;
  /** Scripted demo uses her/you; live turns use persona/learner. */
  lastSpeaker?: 'her' | 'you' | 'persona' | 'learner' | 'system';
};

/**
 * Maps session phase (+ optional affect/comprehension) to a Valentina
 * expression. Comprehension and affect win over phase so live pipeline
 * tags can override the default cadence.
 */
export function expressionForPhase(
  phase: string,
  context: ExpressionContext = {},
): ValentinaExpression {
  if (context.comprehension === 'not_understood')
    return 'surprised';
  if (context.affect === 'warm')
    return 'smile';

  if (phase === 'thinking')
    return 'thinking';
  if (phase === 'speaking')
    return 'speaking';
  if (phase === 'listening')
    return 'listening';

  // Scripted demo has no distinct speaking phase — idle after her line
  // means she is delivering / just delivered.
  if (phase === 'idle' && (context.lastSpeaker === 'her' || context.lastSpeaker === 'persona'))
    return 'speaking';

  return 'idle';
}
