import type { ValentinaExpression } from './cast-assets';

/**
 * A procedural face pose — the R3F character reads these as target values
 * for its meshes' scale/rotation each frame (see `valentina-character.tsx`).
 * Kept as a plain object, independent of `three`/`@react-three/fiber`, so
 * the expression→pose mapping is unit-testable without a GL context.
 */
export type CharacterPose = {
  /** 0 (closed) to 1 (wide open). */
  mouthOpen: number;
  /** -1 (frown) to 1 (broad smile). */
  mouthCurve: number;
  /** -1 (furrowed) to 1 (raised). */
  eyebrowRaise: number;
  /** 0 (normal) to 1 (wide, surprised) — added on top of the blink cycle. */
  eyeWiden: number;
  /** Head turn/tilt as a listening/thinking cue, -1..1, applied as a small rotation. */
  headTilt: number;
};

/**
 * Hand-picked, unvalidated pose values per expression — there's no design
 * doc for "how wide does a surprised mouth open," only `CHARACTER.md`'s
 * prose description of the character's warmth. Same judgment-call status
 * as this codebase's other underspecified affect tables; revisit once
 * there's real reference (e.g. the Rive face in ticket #33) to check
 * against.
 */
export const EXPRESSION_POSES: Record<ValentinaExpression, CharacterPose> = {
  idle: { mouthOpen: 0.08, mouthCurve: 0.25, eyebrowRaise: 0, eyeWiden: 0, headTilt: 0 },
  listening: { mouthOpen: 0.05, mouthCurve: 0.15, eyebrowRaise: 0.15, eyeWiden: 0.1, headTilt: 0.12 },
  speaking: { mouthOpen: 0.45, mouthCurve: 0.3, eyebrowRaise: 0.1, eyeWiden: 0.05, headTilt: -0.05 },
  thinking: { mouthOpen: 0.1, mouthCurve: -0.05, eyebrowRaise: -0.1, eyeWiden: 0, headTilt: 0.2 },
  surprised: { mouthOpen: 0.55, mouthCurve: 0, eyebrowRaise: 0.5, eyeWiden: 0.6, headTilt: -0.1 },
  smile: { mouthOpen: 0.15, mouthCurve: 0.7, eyebrowRaise: 0.2, eyeWiden: 0.05, headTilt: 0.05 },
};

export function getExpressionPose(expression: ValentinaExpression): CharacterPose {
  return EXPRESSION_POSES[expression];
}
