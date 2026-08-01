import type { ValentinaExpression } from './cast-assets';
import { EXPRESSION_POSES, getExpressionPose } from './character-expressions';

const ALL_EXPRESSIONS: ValentinaExpression[] = ['idle', 'listening', 'speaking', 'thinking', 'surprised', 'smile'];

describe('character expression poses', () => {
  it('defines a pose for every expression cast-assets can produce', () => {
    for (const expression of ALL_EXPRESSIONS)
      expect(EXPRESSION_POSES[expression]).toBeDefined();
  });

  it('returns the matching pose for each expression', () => {
    for (const expression of ALL_EXPRESSIONS)
      expect(getExpressionPose(expression)).toBe(EXPRESSION_POSES[expression]);
  });

  it('keeps every pose value within its documented range', () => {
    for (const expression of ALL_EXPRESSIONS) {
      const pose = getExpressionPose(expression);
      expect(pose.mouthOpen).toBeGreaterThanOrEqual(0);
      expect(pose.mouthOpen).toBeLessThanOrEqual(1);
      expect(pose.mouthCurve).toBeGreaterThanOrEqual(-1);
      expect(pose.mouthCurve).toBeLessThanOrEqual(1);
      expect(pose.eyebrowRaise).toBeGreaterThanOrEqual(-1);
      expect(pose.eyebrowRaise).toBeLessThanOrEqual(1);
      expect(pose.eyeWiden).toBeGreaterThanOrEqual(0);
      expect(pose.eyeWiden).toBeLessThanOrEqual(1);
      expect(pose.headTilt).toBeGreaterThanOrEqual(-1);
      expect(pose.headTilt).toBeLessThanOrEqual(1);
    }
  });

  it('opens the mouth widest for surprised, among all expressions', () => {
    const widest = ALL_EXPRESSIONS.reduce((a, b) =>
      getExpressionPose(a).mouthOpen >= getExpressionPose(b).mouthOpen ? a : b);
    expect(widest).toBe('surprised');
  });

  it('curves the mouth most positively for smile, among all expressions', () => {
    const happiest = ALL_EXPRESSIONS.reduce((a, b) =>
      getExpressionPose(a).mouthCurve >= getExpressionPose(b).mouthCurve ? a : b);
    expect(happiest).toBe('smile');
  });

  it('widens the eyes most for surprised, among all expressions', () => {
    const widestEyes = ALL_EXPRESSIONS.reduce((a, b) =>
      getExpressionPose(a).eyeWiden >= getExpressionPose(b).eyeWiden ? a : b);
    expect(widestEyes).toBe('surprised');
  });
});
