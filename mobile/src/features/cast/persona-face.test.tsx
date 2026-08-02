import * as React from 'react';
import { Dimensions } from 'react-native';

import { cleanup, render, screen } from '@/lib/test-utils';
import { PersonaFace } from './persona-face';

afterEach(cleanup);

/**
 * `@react-three/fiber/native`'s `Canvas` is mocked in `jest-setup.ts` to a
 * plain `View` — RTL can't reconcile R3F's custom elements (`<mesh>`,
 * `<sphereGeometry>`, ...) through the normal React Native renderer, and
 * there's no real GL context under Jest anyway. So these tests only cover
 * the outer static frame (unchanged from the earlier PNG-based version);
 * `ValentinaCharacter`'s scene graph isn't exercised here — see
 * `character-expressions.test.ts` for what of the expression logic is
 * unit-tested independent of `three`/R3F.
 */
describe('persona face component', () => {
  it('renders with an accessibility label naming the current expression', () => {
    render(<PersonaFace expression="listening" />);
    expect(screen.getByLabelText('Valentina, listening')).toBeOnTheScreen();
  });

  it('updates the accessibility label when the expression prop changes', () => {
    const { rerender } = render(<PersonaFace expression="idle" />);
    expect(screen.getByLabelText('Valentina, idle')).toBeOnTheScreen();

    rerender(<PersonaFace expression="speaking" />);
    expect(screen.getByLabelText('Valentina, speaking')).toBeOnTheScreen();
  });

  it('renders the 3D canvas inside the frame, for every expression', () => {
    for (const expression of ['idle', 'listening', 'speaking', 'thinking', 'surprised', 'smile'] as const) {
      const { unmount } = render(<PersonaFace expression={expression} />);
      expect(screen.getByTestId('persona-face-canvas')).toBeOnTheScreen();
      unmount();
    }
  });

  it('sizes the panel as a fraction of window height, not a small fixed card — product feedback: "facetime app" sizing', () => {
    const windowHeight = Dimensions.get('window').height;

    render(<PersonaFace expression="idle" heightRatio={0.32} />);

    const panel = screen.getByLabelText('Valentina, idle');
    const style = Array.isArray(panel.props.style) ? Object.assign({}, ...panel.props.style) : panel.props.style;
    expect(style.height).toBe(Math.round(windowHeight * 0.32));
  });

  it('a larger heightRatio produces a proportionally taller panel', () => {
    const windowHeight = Dimensions.get('window').height;
    const { unmount } = render(<PersonaFace expression="idle" heightRatio={0.2} />);
    const smallerStyle = Array.isArray(screen.getByLabelText('Valentina, idle').props.style)
      ? Object.assign({}, ...screen.getByLabelText('Valentina, idle').props.style)
      : screen.getByLabelText('Valentina, idle').props.style;
    unmount();

    render(<PersonaFace expression="idle" heightRatio={0.4} />);
    const largerStyle = Array.isArray(screen.getByLabelText('Valentina, idle').props.style)
      ? Object.assign({}, ...screen.getByLabelText('Valentina, idle').props.style)
      : screen.getByLabelText('Valentina, idle').props.style;

    expect(smallerStyle.height).toBe(Math.round(windowHeight * 0.2));
    expect(largerStyle.height).toBe(Math.round(windowHeight * 0.4));
    expect(largerStyle.height).toBeGreaterThan(smallerStyle.height);
  });
});
