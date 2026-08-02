import type { ValentinaExpression } from './cast-assets';
import { Canvas } from '@react-three/fiber/native';
import * as React from 'react';
import { useWindowDimensions, View } from 'react-native';
import { ValentinaCharacter } from './valentina-character';

type PersonaFaceProps = {
  expression: ValentinaExpression;
  /**
   * Fraction of the window's height the portrait fills — a FaceTime-style
   * top panel, not a small fixed card. 0.32 sits at the upper end of "a
   * quarter and a third of the top space" (product feedback), leaving
   * room below for the transcript and controls.
   */
  heightRatio?: number;
};

const DEFAULT_HEIGHT_RATIO = 0.32;

/**
 * Product feedback: "You're using the png images. Those images are for
 * reference ONLY. You need to create these characters via react three
 * fiber." The PNG stills and their `Animated`-driven drift/blink are gone
 * — Валентина is now a procedural 3D bust (`ValentinaCharacter`), rendered
 * into a `@react-three/fiber/native` `Canvas` running on `expo-gl`. The
 * outer frame (border, rounded corners, fixed height, a11y label) is
 * unchanged from the 2D version, so `converse-screen.tsx` needs no
 * changes and every earlier round of layout feedback still holds.
 *
 * No GLTF model exists for her — `CHARACTER.md` describes the PNG concept
 * art as always having been meant to feed a Blender→GLTF pipeline that
 * was never built. `ValentinaCharacter` builds her from primitive
 * geometry instead of waiting on that asset; see its own doc comment for
 * what that trades away.
 *
 * Verification status: iOS Simulators/Android emulators still don't
 * reliably render expo-gl/Three.js content, and the scene graph isn't
 * renderable under Jest either (see `persona-face.test.tsx`), so the
 * automated tests here only cover the outer frame. The bust itself was
 * checked on a physical Android device instead, by screenshotting this
 * panel over adb — which is how several artefacts invisible to
 * typechecking got caught (an off-screen cardigan, a bun hidden behind
 * the head, sclera crescents). Re-check that way after geometry changes;
 * `valentina-character.tsx`'s numbers are chosen against this camera.
 */
export function PersonaFace({ expression, heightRatio = DEFAULT_HEIGHT_RATIO }: PersonaFaceProps) {
  const { height: windowHeight } = useWindowDimensions();
  const panelHeight = Math.round(windowHeight * heightRatio);

  return (
    <View
      className="w-full overflow-hidden rounded-[28px] border border-ink/10 bg-white"
      style={{ height: panelHeight }}
      accessibilityRole="image"
      accessibilityLabel={`Valentina, ${expression}`}
    >
      {/*
        R3F's native canvas defaults `antialias` to false (see its
        `getContext` shim) and there is no `dpr` prop to raise — it already
        renders at `PixelRatio.get()`, which expo-gl requires. So MSAA is the
        only lever on edge quality, and it visibly cleans up the hair's
        silhouette against the white panel.
      */}
      <Canvas
        testID="persona-face-canvas"
        style={{ flex: 1 }}
        gl={{ antialias: true }}
        camera={{ position: [0, 0, 2.6], fov: 28 }}
      >
        {/*
          CHARACTER.md Lighting: "Soft studio lighting. Warm. Minimal
          shadows. No dramatic rim lighting." The previous rig was a 0.65
          ambient plus two white directionals, and the flat ambient was most
          of why she read as plastic — it lifts every surface equally, so the
          form carries almost no gradient.

          The hemisphere light does that job instead: warm from above, and a
          skin-toned bounce from below standing in for light kicking off the
          cream panel and her own blouse. That single change is what puts a
          gradient across the cheeks and under the jaw. Ambient stays only as
          a floor so nothing crushes to black. Key is warm and off to one
          side (and is what the eye catch-lights in `valentina-character.tsx`
          are positioned against); the cool fill opposite it keeps the shadow
          side from going muddy, since warm-on-warm reads as dirt. The back
          light is deliberately weak — enough to lift the silver hair off a
          white panel, short of the "dramatic rim" the brief rules out.
        */}
        <hemisphereLight args={['#FFF1DE', '#C08A6E', 0.9]} />
        <ambientLight intensity={0.16} color="#FFF6EA" />
        <directionalLight position={[1.7, 2.1, 2.4]} intensity={0.78} color="#FFE8CB" />
        <directionalLight position={[-2, 0.3, 1.3]} intensity={0.24} color="#D9E4F2" />
        <directionalLight position={[-0.5, 1.5, -1.9]} intensity={0.3} color="#FFE0BE" />
        <ValentinaCharacter expression={expression} />
      </Canvas>
    </View>
  );
}
