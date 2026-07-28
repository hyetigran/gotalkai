/**
 * LingoAI design system tokens.
 *
 * Source of truth: `Initial mockup request/design_handoff_conversation_loop/README.md`
 * (high-fidelity design handoff for the Open/Converse/Debrief/Tomorrow/
 * Address-book/Settings screens). Values here must match that document
 * exactly — it is the spec, this module is the implementation of it.
 *
 * Most of these are also registered as Tailwind theme tokens in
 * `src/global.css` (colors as `--color-*`, fonts as `--font-family-*`) so
 * screens can use `bg-paper`, `text-ink/62`, `font-serif`, etc. directly.
 * This module exists for the values that don't map to a Tailwind class:
 * raw RN style objects (shadows), numeric ladders (chip opacity), and
 * typography roles that bundle family + size + line-height + tracking as
 * one unit.
 */

/**
 * Base colors. Alpha variants (hairline, divider, ink levels) are opacity
 * modifiers on `ink` / `accent` in Tailwind usage (`text-ink/62`,
 * `border-ink/10`) — see `inkAlphaFloors` below for the specific floors the
 * mockup's accessibility review fixed.
 */
export const colors = {
  paper: '#FBF6EC',
  paperStepped: '#F3ECDE',
  card: '#FFFFFF',
  ink: '#231F18',
  accent: '#A0543A',
  accentPressed: '#8E4831',
  /** Open screen's portrait placeholder hatch (135deg repeating gradient). */
  portraitHatch: { stop1: '#EFE7D9', stop2: '#E6DCCA' },
  /**
   * Address-book disc hatch — a close but distinct variant (tighter
   * stripe width) from the Open-screen portrait hatch above.
   */
  addressBookDiscHatch: { stop1: '#EFE7D9', stop2: '#E4D9C4' },
  /** Address-book disc hatch for next/sealed entries — a faint neutral tint, not the accent-toned reached hatch above. */
  addressBookDiscHatchLocked: { stop1: 'rgba(35,31,24,0.04)', stop2: 'rgba(35,31,24,0.08)' },
} as const;

/**
 * Ink opacity floors that were explicitly raised during the mockup's design
 * review (README.md "Accessibility"). Contrast was checked against
 * `#FBF6EC`; going below these regresses a fix that was already made once.
 */
export const inkAlphaFloors = {
  /** Reveal hint, 11px IBM Plex Mono — was failing contrast at .3/9px. */
  revealHint: 0.55,
  /**
   * Revealed translation, 14px system — a comprehension aid read under
   * pressure; the mockup's "dimmer, smaller" has a floor.
   */
  revealedTranslation: 0.6,
  /**
   * Address-book role line — held at this floor in every state,
   * including sealed entries.
   */
  addressBookRoleLine: 0.62,
} as const;

/** General ink de-emphasis ladder used outside the fixed floors above. */
export const inkAlphaScale = {
  secondary: 0.62,
  tertiary: 0.55,
  quaternary: 0.45,
  label: 0.42,
  sealed: 0.38,
} as const;

/** 4px base spacing scale, as used across the mockup's screens. */
export const spacing = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 26, 34] as const;

/** Corner radii by shape category. */
export const radii = {
  /** Chips, discs, pill-shaped controls. */
  pill: 100,
  /** Large screen-level cards (persona card, debrief patterns, etc). */
  card: 18,
  /** Inner/nested cards. */
  innerCard: 13,
  /** Difficulty-dial track. */
  dialTrack: 3,
} as const;

/**
 * Shadows as RN style objects — the mockup's box-shadows are a flat offset,
 * not a blur ("it reads as printed ink"), which RN's shadow props represent
 * more directly than a CSS box-shadow string would.
 */
export const shadows = {
  card: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  reachedEntry: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
  },
  button: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 0,
  },
  /** Hold-to-think button, rest state only — held state has no shadow. */
  holdToThinkRest: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
} as const;

/**
 * Registered font-family names — must match the exact-style families
 * defined in `app.config.ts`'s `expo-font` plugin config (one family per
 * style, not weight-grouped, so there's no OS-level weight resolution).
 */
const fontFamily = {
  serif: 'PTSerif-Regular',
  serifItalic: 'PTSerif-Italic',
  mono: 'IBMPlexMono-Regular',
  monoMedium: 'IBMPlexMono-Medium',
} as const;

type TypographyRole = {
  /**
   * Omitted for the `body` role — "System" in the mockup means the
   * platform default, not one of the registered PT Serif / IBM Plex Mono
   * families.
   */
  fontFamily?: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
};

/**
 * Typography roles from the mockup's type table. Rule of thumb the mockup
 * states: serif for anything a person says or is called; mono for anything
 * the system reports; system sans for explanation. Never mix within a
 * line.
 */
export const typography: Record<string, TypographyRole> = {
  herVoice: {
    fontFamily: fontFamily.serif,
    fontSize: 20,
    lineHeight: 30,
  },
  screenTitle: {
    fontFamily: fontFamily.serif,
    fontSize: 27,
    lineHeight: 35,
  },
  cardTitleLarge: {
    fontFamily: fontFamily.serif,
    fontSize: 21,
    lineHeight: 27,
  },
  cardTitleSmall: {
    fontFamily: fontFamily.serif,
    fontSize: 17,
    lineHeight: 22,
  },
  learnerTurn: {
    fontFamily: fontFamily.serif,
    fontSize: 16,
    lineHeight: 23,
  },
  addressBookRoleLine: {
    fontFamily: fontFamily.serifItalic,
    fontSize: 13,
    lineHeight: 18,
  },
  /**
   * Body / explanation text — the mockup specifies a range ("System,
   * 13–16px/1.45–1.6"), not one fixed size, because this role covers
   * several different explanation strings across screens. 14px/1.5 is the
   * default; specific instances may need 13–16px within that stated range
   * — see the revealed-translation floor in `inkAlphaFloors` for one
   * concrete instance (14px) already anchored elsewhere in this module.
   */
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
  /**
   * Mono meta/eyebrow/state text. `letterSpacing` is a representative
   * default (from the reveal-hint instance) within the mockup's stated
   * range for this role (`.03–.14em`, i.e. roughly 0.3–1.5px at this font
   * size) — specific screens should override it per-instance where the
   * mockup calls for a different tracking value (e.g. `.12em` on Open's
   * header date, `.08em` on the Address book gate line).
   */
  metaEyebrowState: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.5,
  },
  metaRegular: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    lineHeight: 18,
  },
};

/** Suggestion-chip decaying-contrast scaffold (§6.3), by chip index. */
export const chipOpacityLadder = [1, 0.6, 0.36, 0.2] as const;

/** Motion timings, in milliseconds (mockup values were CSS durations). */
export const motion = {
  barLoopMinMs: 620,
  barLoopMaxMs: 1100,
  barLoopStaggerMs: 70,
  buttonFadeInMs: 320,
  castExpandMs: 280,
  fillerBlinkMs: 1100,
  meterTransitionMs: 200,
} as const;
