import type { LayoutChangeEvent } from 'react-native';
import * as React from 'react';
import { View } from 'react-native';

type PortraitHatchProps = {
  stop1: string;
  stop2: string;
  /** Stripe width in px, matching the CSS `repeating-linear-gradient` stop distance. */
  stripeWidth: number;
};

/**
 * The 45°-hatch placeholder texture used for portrait/disc placeholders
 * (README: `repeating-linear-gradient(135deg, stop1 0 stripeWidth, stop2
 * stripeWidth stripeWidth*2)`). "Replace with the persona portrait image"
 * per the mockup — this is deliberately a placeholder, not final art.
 *
 * Plain rotated `View` strips, not `react-native-svg`'s `Pattern` (the
 * prior implementation): `fill="url(#hatch)")` never resolved on-device —
 * the `Defs`/`Pattern` didn't throw, but painted zero pixels, leaving the
 * whole portrait area flat. Measuring via `onLayout` and overlaying
 * oversized rotated strips, clipped by the parent's `overflow: hidden`,
 * sidesteps `Pattern` entirely.
 *
 * Used by the Open screen's portrait area (`colorsDark.portraitHatch`, 7px).
 * The Address book's discs used a 6px variant of this same texture before
 * they had real portraits (`CAST_PORTRAITS`, cast-assets.ts) to show.
 */
export function PortraitHatch({ stop1, stop2, stripeWidth }: PortraitHatchProps) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  // Oversized square covering the box regardless of rotation, so strips
  // never leave a gap at the corners once clipped by `overflow: hidden`.
  const diagonal = Math.ceil(Math.sqrt(size.width ** 2 + size.height ** 2)) + stripeWidth * 2;
  const stripeCount = size.width > 0 && size.height > 0 ? Math.ceil(diagonal / stripeWidth) : 0;

  return (
    <View onLayout={onLayout} style={{ flex: 1, overflow: 'hidden', backgroundColor: stop2 }}>
      {Array.from({ length: stripeCount }, (_, i) => i)
        .filter(i => i % 2 === 0)
        .map(i => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: -diagonal / 2 + size.height / 2,
              left: i * stripeWidth - diagonal / 2 + size.width / 2,
              width: stripeWidth,
              height: diagonal,
              backgroundColor: stop1,
              transform: [{ rotate: '135deg' }],
            }}
          />
        ))}
    </View>
  );
}
