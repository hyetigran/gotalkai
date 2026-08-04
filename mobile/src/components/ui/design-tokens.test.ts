/**
 * @jest-environment node
 *
 * Plain node environment, not jest-expo's RN-flavored jsdom. jest-expo's
 * preset globally polyfills `TextDecoder` with Expo's Hermes-oriented shim
 * (no 'ascii' support), which breaks fontkit's binary parsing regardless of
 * testEnvironment. Restore Node's real TextDecoder/TextEncoder before
 * requiring fontkit — everything else in this file is environment-agnostic.
 */
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import {
  brandColors,
  colors,
  inkAlphaFloors,
  radii,
  spacing,
  typography,
} from './design-tokens';
import { fontManifest } from './font-manifest';

(globalThis as any).TextDecoder = TextDecoder;
(globalThis as any).TextEncoder = TextEncoder;

// Must load after the TextDecoder/TextEncoder restoration above — a hoisted
// `import` would run before it and fontkit would see the broken shim again.
const fontkit = require('fontkit');

describe('design-tokens', () => {
  it('matches the design spec color values exactly', () => {
    expect(colors.page).toBe('#FFFFFF');
    expect(colors.band).toBe('#F7F6FE');
    expect(colors.ink).toBe('#2A1F62');
    expect(colors.accent).toBe('#6C5CE7');
    expect(colors.accentPressed).toBe('#5546C8');
  });

  it('matches the design spec brand colors, identical in both themes', () => {
    expect(brandColors.violet600).toBe(colors.accent);
    expect(brandColors.yellow).toBe('#FFC857');
    expect(brandColors.green).toBe('#4CD964');
  });

  it('never lets a learner-must-read floor regress below the mockup accessibility review', () => {
    // These two were explicitly raised during the prior mockup's design
    // review — do not lower them again without rechecking contrast against
    // the new `page`/`card` backgrounds.
    expect(inkAlphaFloors.revealHint).toBeGreaterThanOrEqual(0.55);
    expect(inkAlphaFloors.revealedTranslation).toBeGreaterThanOrEqual(0.6);
    expect(inkAlphaFloors.addressBookRoleLine).toBeGreaterThanOrEqual(0.62);
  });

  it('matches the design spec spacing scale', () => {
    expect(spacing).toEqual([4, 6, 9, 13, 16, 20, 26, 34, 44, 56]);
  });

  it('defines a typography role for every mockup role', () => {
    const roles = Object.keys(typography);
    expect(roles).toEqual(
      expect.arrayContaining([
        'herVoice',
        'screenTitle',
        'learnerTurn',
        'metaEyebrowState',
      ]),
    );
  });

  it('every typography role references a registered font-family token', () => {
    const registeredFamilies = [
      'Poppins-Regular',
      'Poppins-Medium',
      'Poppins-SemiBold',
      'Poppins-Bold',
      'JetBrainsMono-Regular',
      'JetBrainsMono-Medium',
      'Inter-Medium',
    ];
    Object.values(typography).forEach((value) => {
      expect(registeredFamilies).toContain(value.fontFamily);
    });
  });

  it('matches the design spec Body and Caption rows exactly', () => {
    const { body, caption } = typography;
    expect(body.fontSize).toBe(16);
    expect(body.lineHeight / body.fontSize).toBeCloseTo(1.6, 2);
    expect(caption.fontSize).toBe(13);
    expect(caption.lineHeight / caption.fontSize).toBeCloseTo(1.55, 2);
  });

  it('radii cover the pill (chips/discs) and card shapes from the mockup', () => {
    expect(radii.pill).toBe(999);
    expect(radii.card).toBe(20);
  });
});

describe('cyrillic + stress-mark coverage of fonts actually used for target-language text', () => {
  // Mirrors the mockup's own required UAT string (README.md "Fidelity") plus
  // a full Cyrillic alphabet sweep and the U+0301 combining acute used for
  // stress annotation (PRD §7.4). A font swap that silently drops any of
  // these would teach the learner a pronunciation error.
  //
  // Only checks the font(s) `herVoice`/`learnerTurn` actually reference, not
  // every bundled font — Poppins (the new design spec's font) is bundled for
  // English UI chrome and deliberately ships zero Cyrillic glyphs (see
  // `font-manifest.ts`'s doc comment); sweeping it here would just
  // reintroduce a permanent, meaningless failure.
  const requiredCodePoints = Array.from(
    'ёщъыэюя' + 'абвгдежзийклмнопрстуфхцчшы' + '́',
  ).map(char => char.codePointAt(0)!);

  const cyrillicRoleFamilies = new Set(
    [typography.herVoice, typography.learnerTurn].map(role => role.fontFamily),
  );
  const bundledFontPaths = fontManifest
    .filter(font => cyrillicRoleFamilies.has(font.family))
    .map(font => font.path);

  it('checks at least one font (guards against the filter above silently matching nothing)', () => {
    expect(bundledFontPaths.length).toBeGreaterThan(0);
  });

  it.each(bundledFontPaths)('%s covers every required code point', (relPath) => {
    const font = fontkit.openSync(path.resolve(__dirname, '../../../', relPath));
    const missing = requiredCodePoints.filter(
      codePoint => !font.hasGlyphForCodePoint(codePoint),
    );
    expect(missing).toEqual([]);
  });
});
