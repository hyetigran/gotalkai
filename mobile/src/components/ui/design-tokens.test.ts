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
  chipOpacityLadder,
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
  it('matches the mockup color values exactly', () => {
    expect(colors.paper).toBe('#FBF6EC');
    expect(colors.paperStepped).toBe('#F3ECDE');
    expect(colors.ink).toBe('#231F18');
    expect(colors.accent).toBe('#A0543A');
    expect(colors.accentPressed).toBe('#8E4831');
  });

  it('exposes the suggestion-chip decay ladder in index order', () => {
    expect(chipOpacityLadder).toEqual([1, 0.6, 0.36, 0.2]);
  });

  it('never lets a learner-must-read floor regress below the mockup accessibility review', () => {
    // These two were explicitly raised during the mockup's design review
    // (see README.md "Accessibility") — do not lower them again.
    expect(inkAlphaFloors.revealHint).toBeGreaterThanOrEqual(0.55);
    expect(inkAlphaFloors.revealedTranslation).toBeGreaterThanOrEqual(0.6);
    expect(inkAlphaFloors.addressBookRoleLine).toBeGreaterThanOrEqual(0.62);
  });

  it('keeps the 4px spacing base', () => {
    spacing.forEach((value) => {
      expect(value % 2).toBe(0);
    });
    expect(spacing[0]).toBe(4);
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

  it('every typography role references a registered font-family token, except the system-default body role', () => {
    const registeredFamilies = [
      'PTSerif-Regular',
      'PTSerif-Italic',
      'IBMPlexMono-Regular',
      'IBMPlexMono-Medium',
    ];
    Object.entries(typography).forEach(([role, value]) => {
      if (role === 'body') {
        expect(value.fontFamily).toBeUndefined();
        return;
      }
      expect(registeredFamilies).toContain(value.fontFamily);
    });
  });

  it('covers the mockup body/explanation role within its stated range (13–16px, 1.45–1.6 line-height)', () => {
    const { body } = typography;
    expect(body.fontSize).toBeGreaterThanOrEqual(13);
    expect(body.fontSize).toBeLessThanOrEqual(16);
    expect(body.lineHeight / body.fontSize).toBeGreaterThanOrEqual(1.45);
    expect(body.lineHeight / body.fontSize).toBeLessThanOrEqual(1.6);
  });

  it('radii cover the pill (chips/discs) and card shapes from the mockup', () => {
    expect(radii.pill).toBe(100);
    expect(radii.card).toBeGreaterThanOrEqual(16);
    expect(radii.card).toBeLessThanOrEqual(20);
  });
});

describe('bundled font Cyrillic + stress-mark coverage', () => {
  // Mirrors the mockup's own required UAT string (README.md "Fidelity") plus
  // a full Cyrillic alphabet sweep and the U+0301 combining acute used for
  // stress annotation (PRD §7.4). A font swap that silently drops any of
  // these would teach the learner a pronunciation error.
  const requiredCodePoints = Array.from(
    'ёщъыэюя' + 'абвгдежзийклмнопрстуфхцчшы' + '́',
  ).map(char => char.codePointAt(0)!);

  const bundledFontPaths = fontManifest.map(font => font.path);

  it.each(bundledFontPaths)('%s covers every required code point', (relPath) => {
    const font = fontkit.openSync(path.resolve(__dirname, '../../../', relPath));
    const missing = requiredCodePoints.filter(
      codePoint => !font.hasGlyphForCodePoint(codePoint),
    );
    expect(missing).toEqual([]);
  });
});
