/**
 * LingoAI design system tokens.
 *
 * Source of truth: `mobile/Design Spec Sheet.dc.html` ("LingoAI mobile —
 * design spec", ported from the marketing site's purple/Poppins redesign).
 * Values here must match that document exactly — it is the spec, this
 * module is the implementation of it. Supersedes the prior cream/PT-Serif/
 * terracotta system (whose spec was
 * `Initial mockup request/design_handoff_conversation_loop/README.md`).
 *
 * Most of these are also registered as Tailwind theme tokens in
 * `src/global.css` (colors as `--color-*`, fonts as `--font-family-*`) so
 * screens can use `bg-page`, `text-ink/62`, `font-sans-medium`, etc.
 * directly. This module exists for the values that don't map to a Tailwind
 * class: raw RN style objects (shadows), numeric ladders (chip opacity),
 * and typography roles that bundle family + size + line-height + tracking
 * as one unit. `colors` below is LIGHT-mode only — it's consumed by a
 * handful of call sites that need a raw hex outside Tailwind's class
 * pipeline (e.g. `portrait-hatch.tsx`'s gradient stops, the native tab bar
 * tint in `app/(tabs)/_layout.tsx`) and none of those currently read the
 * device color scheme; if a dark-aware raw value is needed later, add a
 * sibling `colorsDark` object rather than overloading this one.
 */

/**
 * Base colors (light mode). Alpha variants (hairline, divider, ink levels)
 * are opacity modifiers on `ink` / `accent` in Tailwind usage
 * (`text-ink/62`, `border-ink/10`) — see `inkAlphaFloors` below for the
 * specific floors the mockup's accessibility review fixed.
 */
export const colors = {
  page: '#FFFFFF',
  band: '#F7F6FE',
  card: '#FFFFFF',
  tint: '#F3F0FF',
  line: '#EDEAFB',
  ink: '#2A1F62',
  body: '#7A739A',
  muted: '#8B84A8',
  nav: '#5B5478',
  accent: '#6C5CE7',
  /** Pressed state for a solid `accent` fill — Violet 700 (spec §02), not a semantic/theme-aware token. */
  accentPressed: '#5546C8',
  accentDeep: '#4A3FA8',
  shadow: 'rgba(60,45,140,.45)',
  /** Open screen's portrait placeholder hatch (135deg repeating gradient). */
  portraitHatch: { stop1: '#EFE7D9', stop2: '#E6DCCA' },
} as const;

/**
 * Dark-mode counterpart to `colors` above, values mirrored verbatim from
 * `global.css`'s `.dark` class block — the sibling object this file's own
 * header comment asks for once a raw (non-Tailwind-class) call site needs
 * to be dark-aware. First consumer: the native tab bar's `iconColor` in
 * `app/(tabs)/_layout.tsx`, a `NativeTabs` prop that takes a resolved
 * `ColorValue`, not a CSS variable — `useUniwind()`'s `theme` is what
 * picks between this and `colors` at that call site.
 */
export const colorsDark = {
  page: '#131129',
  band: '#191634',
  card: '#211E40',
  tint: '#2A2650',
  line: '#332E5F',
  ink: '#F2F0FF',
  body: '#ADA6CC',
  muted: '#928BB4',
  nav: '#B7B1D4',
  accent: '#A99BFF',
  accentDeep: '#C9BEFF',
  shadow: 'rgba(0,0,0,.55)',
  /**
   * Open screen's portrait placeholder hatch, dark counterpart —
   * `tint`/`line` (not a bespoke pair) so the stripes read as this same
   * palette rather than the old cream/terracotta system's leftover
   * `colors.portraitHatch`, which visibly clashed once the rest of the
   * card switched to the purple/Poppins redesign.
   */
  portraitHatch: { stop1: '#2A2650', stop2: '#332E5F' },
} as const;

/**
 * Brand colors — identical in both themes (spec §02). Text on `yellow`/
 * `green` is always the paired dark on-color (`onYellow`/`onGreen`), never
 * white.
 */
export const brandColors = {
  violet600: '#6C5CE7',
  violet700: '#5546C8',
  violet500: '#8A5CE7',
  yellow: '#FFC857',
  yellowPressed: '#F5B935',
  green: '#4CD964',
  blue: '#4490E2',
  cyan: '#26C6DA',
  pink: '#FF6B9D',
  onYellow: '#3B2E00',
  onGreen: '#0C3D1B',
  /** Meter's non-accent bars — light value; dark is `#4A3FA8` (see global.css `--color-meter-dim`). */
  meterDim: '#C9C2F5',
} as const;

/**
 * Ink opacity floors that were explicitly raised during the (prior) design
 * review. Contrast was checked against the old `#FBF6EC` paper background;
 * revalidate against `#FFFFFF`/`#131129` (`page`) before relying on these
 * for the new system — they're carried over as a starting point, not
 * re-derived from the new spec, which doesn't itself specify an alpha
 * ladder (it favors dedicated `body`/`muted`/`nav` tokens over opacity
 * modifiers — see those in `colors` above for the preferred alternative
 * where a role clearly matches one of them).
 */
export const inkAlphaFloors = {
  /** Reveal hint, 11px — was failing contrast at .3/9px. */
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

/** 4px base spacing scale (spec §04 layout: "Scale: 4·6·9·13·16·20·26·34·44·56"). */
export const spacing = [4, 6, 9, 13, 16, 20, 26, 34, 44, 56] as const;

/**
 * `(tabs)/_layout.tsx`'s `NativeTabs` renders iOS 26's floating "Liquid
 * Glass" tab bar, which *overlays* screen content rather than reserving
 * its own layout row — `expo-router/unstable-native-tabs` exposes no
 * `useBottomTabBarHeight`-style hook to size around it. Measured on an
 * iPhone 16 Pro simulator (screenshot pixel-diffing the tab bar's top
 * edge against the device's safe-area bottom inset): the bar's own
 * height above the safe area is ~70pt. Screens inside the tabs group
 * (Open/Address book/Debrief history) that pin content to the bottom
 * edge should pad by `useSafeAreaInsets().bottom + tabBarClearance`, not
 * a flat constant — a flat value (e.g. the old `pb-[44px]`) is exactly
 * what let the Open screen's "Pick up" CTA render underneath the bar.
 */
export const tabBarClearance = 70;

/** Corner radii by shape category (spec §04). */
export const radii = {
  /** Chips, discs, pill-shaped controls. */
  pill: 999,
  /** Large screen-level cards (persona card, debrief patterns, etc). */
  card: 20,
  /** Bottom sheets — top corners only. */
  sheet: 28,
  /** Full-bleed immersive surfaces (e.g. the Converse screen's gradient panel). */
  immersivePanel: 26,
  /** Media (portraits, illustrations). */
  media: 14,
  /** App icon tile. */
  appIconTile: 11,
  /** Inner/nested cards — not in the new spec's own radius table; kept at its prior value pending a spec update. */
  innerCard: 13,
  /** Difficulty-dial track. */
  dialTrack: 3,
} as const;

/** Chat-bubble corner radii (spec §04: "Bubble (them)" / "Bubble (you)"). */
export const bubbleRadii = {
  them: '20px 20px 20px 6px',
  you: '20px 20px 6px 20px',
} as const;

/**
 * Shadows as RN style objects. Unlike the prior cream system's flat-offset
 * "printed ink" shadows, the new spec uses a soft blurred elevation
 * (`0 12px 30px -20px {shadow}` etc.) — RN's `shadowRadius` maps to the
 * blur term, `shadowOffset` to the vertical offset; the negative
 * "spread"-style third value in the CSS isn't representable in RN's shadow
 * API and is dropped (RN has no equivalent to `box-shadow`'s spread).
 */
export const shadows = {
  /** Card rest — spec §04: `0 12px 30px -20px {shadow}`. */
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 30,
  },
  /** Card raised — spec §04: `0 18px 44px -22px {shadow}`. */
  cardRaised: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 1,
    shadowRadius: 44,
  },
  /** Primary CTA — spec §05 Buttons: `0 12px 28px -8px rgba(255,200,87,.8)`. */
  cta: {
    shadowColor: 'rgba(255,200,87,.8)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 28,
  },
  /** Brand (violet) button — spec §05 Buttons: `0 6px 18px -6px rgba(108,92,231,.6)`. */
  brandButton: {
    shadowColor: 'rgba(108,92,231,.6)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  /** Reached-entry highlight (address book) — not in the new spec; kept at its prior value. */
  reachedEntry: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
  },
  /** Hold-to-talk button, rest state only — held state has no shadow. Not in the new spec; kept at its prior value pending a component-specific spec entry. */
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
 * weight, not weight-grouped, so there's no OS-level weight resolution).
 */
const fontFamily = {
  sans: 'Poppins-Regular',
  sansMedium: 'Poppins-Medium',
  sansSemibold: 'Poppins-SemiBold',
  sansBold: 'Poppins-Bold',
  mono: 'JetBrainsMono-Regular',
  monoMedium: 'JetBrainsMono-Medium',
  /**
   * Poppins ships with zero Cyrillic glyphs (verified by
   * `design-tokens.test.ts`'s font-coverage sweep) — target-language
   * dialogue text (`herVoice`, `learnerTurn`) uses this Inter weight
   * instead, the only font in this app confirmed to cover Cyrillic +
   * the U+0301 stress mark at a weight matching the rest of the type
   * scale. See `font-manifest.ts`'s doc comment for the full story.
   */
  cyrillicMedium: 'Inter-Medium',
} as const;

type TypographyRole = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
};

/**
 * Typography roles from the spec's type scale (§03) — "Poppins only, four
 * weights", each role a distinct (family, size, line-height, tracking)
 * combination rather than the old system's serif/mono role split. Mapped
 * from the spec's marketing-oriented row names to this app's own roles by
 * matching sample text and size where the spec gives an explicit
 * mobile-app example (`herVoice` ← the "+1 step · Target language" row,
 * literally a persona-turn sample; `addressBookRoleLine` ← "Role/meta",
 * sample text "Grandmother · 78, and slightly deaf" is this app's own
 * address-book copy verbatim) — other roles (`learnerTurn`) use the
 * closest-fit row by size/weight where no sample text match exists.
 */
export const typography: Record<string, TypographyRole> = {
  /** Spec "+1 step · Target language" row — persona's spoken line. Cyrillic content, so Inter, not Poppins — see `fontFamily.cyrillicMedium`. */
  herVoice: {
    fontFamily: fontFamily.cyrillicMedium,
    fontSize: 17,
    lineHeight: 25.5,
  },
  /** Spec "Screen title" row, sample "Who you'll meet". */
  screenTitle: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 27,
    lineHeight: 31.05,
    letterSpacing: -0.27,
  },
  /** Spec "Section" row, sample "Today's conversation". */
  cardTitleLarge: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 21,
    lineHeight: 25.2,
    letterSpacing: -0.21,
  },
  /** Spec "Card title" row, sample "Valentina". */
  cardTitleSmall: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 19,
    lineHeight: 23.75,
    letterSpacing: -0.19,
  },
  /** Spec "Body emphasis" row — the learner's own transcript line. Cyrillic content, so Inter, not Poppins — see `fontFamily.cyrillicMedium`. */
  learnerTurn: {
    fontFamily: fontFamily.cyrillicMedium,
    fontSize: 16,
    lineHeight: 24.8,
  },
  /** Spec "Role/meta" row — sample text is this app's own address-book copy verbatim. */
  addressBookRoleLine: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 14,
    lineHeight: 20.3,
  },
  /** Spec "Body" row. */
  body: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    lineHeight: 25.6,
  },
  /** Spec "Caption" row. */
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 20.15,
  },
  /** Spec "Eyebrow" row — replaces the old mono-based eyebrow/state role. */
  metaEyebrowState: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 11,
    lineHeight: 11,
    letterSpacing: 0.99,
  },
  /** Spec "Micro" row — sample text "hold to talk" is this app's own Converse-screen copy verbatim. */
  metaRegular: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    lineHeight: 14.3,
  },
};

/**
 * Motion timings, in milliseconds — UI-feel timings the spec doesn't
 * define; kept at their prior values.
 */
export const motion = {
  buttonFadeInMs: 320,
  castExpandMs: 280,
  fillerBlinkMs: 1100,
} as const;
