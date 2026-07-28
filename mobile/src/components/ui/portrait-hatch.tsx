import * as React from 'react';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

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
 * Shared between the Open screen's portrait area (`colors.portraitHatch`,
 * 7px) and the Address book's discs (`colors.addressBookDiscHatch`, 6px,
 * plus a faint neutral variant for next/sealed entries).
 */
export function PortraitHatch({ stop1, stop2, stripeWidth }: PortraitHatchProps) {
  const tile = stripeWidth * 2 * Math.SQRT2;
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <Pattern
          id="hatch"
          patternUnits="userSpaceOnUse"
          width={tile}
          height={tile}
          patternTransform="rotate(135)"
        >
          <Rect width={tile} height={tile} fill={stop2} />
          <Rect width={tile / 2} height={tile} fill={stop1} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#hatch)" />
    </Svg>
  );
}
