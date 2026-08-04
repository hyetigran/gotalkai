import { useGLTF } from '@react-three/drei/native';
import { Canvas } from '@react-three/fiber';
import { Asset } from 'expo-asset';
import * as React from 'react';
import { View } from 'react-native';

/**
 * UAT: "I added grandma.glb file, can you incorporate that into the app" —
 * the Converse screen's new 3D portrait area (it had no portrait at all
 * before this; the hatch-pattern placeholder with "portrait — Rive
 * character, v2" text lives on the Open screen, a different component
 * entirely — see open-screen.tsx).
 *
 * Loads `valentina.png-optimized-25000-top.glb`, not the originally-added
 * `grandma.glb`: the latter is a 60MB unoptimized export, and native
 * `useGLTF` reads the whole file into memory as base64 before parsing —
 * far too slow/heavy on-device at that size. This pre-optimized 1.8MB
 * variant was already sitting in assets/ from earlier work on the same
 * persona model.
 *
 * `Asset.fromModule(...).uri`, not passing the `require()` result
 * directly to `useGLTF`: React Native's `require()` for a binary asset
 * resolves to a Metro module id, not a real file path/URL — `expo-asset`
 * is what turns that into something `useGLTF`'s loader can actually
 * fetch. `.downloadAsync()` first (awaited via a small local-loading
 * effect below, not at import time) because on some platforms the asset
 * isn't guaranteed to be present at its local `uri` until downloaded at
 * least once, even for a bundled file.
 */
const personaModelModule = require('../../../../assets/valentina.png-optimized-25000-top.glb') as number;

function GrandmaModel({ uri }: { uri: string }) {
  const { scene } = useGLTF(uri);
  // Bounding box measured on-device: ~1.41×1.80×1.19, local-space center
  // ~(0, 0.9, 0). This re-centers the bust to the world origin so it
  // sits inside the camera's frame (the old `[0, -1, 0]` guess put nearly
  // the whole mesh below the vertical FOV).
  //
  // KNOWN ISSUE, unresolved: even with this framing corrected, the mesh
  // does not visibly render on-device (iOS Simulator / EXGL) — confirmed
  // via `Box3.setFromObject` reporting a correct, in-frame bounding box,
  // and confirmed the Canvas/camera/renderer pipeline itself is healthy
  // (a plain `<mesh><boxGeometry/></mesh>` in the same `<Canvas>` renders
  // fine). Ruled out by direct on-device testing: texture load, PBR
  // material/lighting (swapping to an unlit `MeshBasicMaterial` didn't
  // help), frustum culling, GPU skinning (rebuilding as a plain unskinned
  // `Mesh` from the same geometry didn't help), and the 32-bit index
  // buffer needing `OES_element_index_uint` (downcasting to `Uint16Array`
  // didn't help either). That leaves something in how this specific
  // GLB's binary buffer views get parsed on this platform — needs an
  // actual GPU frame capture (Xcode's Metal/GL debugger) to pin down,
  // which isn't available from this environment. Until fixed, this
  // renders the hatch/frequency `background` prop only.
  return <primitive object={scene} scale={1} position={[0, -0.9, 0]} />;
}

/**
 * Loading the asset itself is async (see the module comment above) —
 * this owns that step so `GrandmaModel`/`useGLTF` only ever run once a
 * real local `uri` exists, rather than teaching `useGLTF` itself about
 * the loading state.
 */
function usePortraitAssetUri(): string | null {
  const [uri, setUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(personaModelModule);
    asset.downloadAsync().then(() => {
      if (!cancelled && asset.localUri)
        setUri(asset.localUri);
    }).catch(() => {
      // No error UI here yet — see this file's header comment on
      // verification status. A failed load currently just leaves the
      // portrait area empty rather than crashing the screen.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return uri;
}

/**
 * PRD-established portrait area proportions match open-screen.tsx's own
 * hatch placeholder (196px tall) — visual consistency between the two
 * screens' persona-card-shaped regions, not a hard requirement of this
 * component itself.
 */
type PersonaPortrait3DProps = {
  /**
   * UAT: "the flat white background seems plain" (Converse) / "something
   * other than bars" (Open) — each screen behind this shared component
   * wants a different backdrop, so it's supplied rather than hardcoded.
   * Rendered behind the (transparent) `<Canvas>`, filling this component's
   * own 196px-tall box; callers are responsible for their own fill sizing
   * (e.g. `StyleSheet.absoluteFillObject`).
   */
  background?: React.ReactNode;
};

export function PersonaPortrait3D({ background }: PersonaPortrait3DProps) {
  const uri = usePortraitAssetUri();

  return (
    <View style={{ height: 196, width: '100%' }}>
      {background}
      {uri && (
        // `gl={{ alpha: true }}`: without it three.js clears to opaque
        // black each frame, hiding the `background` prop underneath.
        <Canvas style={{ flex: 1 }} gl={{ alpha: true }} camera={{ position: [0, 0, 3.6], fov: 40 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[2, 2, 2]} intensity={1} />
          <React.Suspense fallback={null}>
            <GrandmaModel uri={uri} />
          </React.Suspense>
        </Canvas>
      )}
    </View>
  );
}
