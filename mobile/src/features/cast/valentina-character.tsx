import type { Group, Mesh } from 'three';
import type { ValentinaExpression } from './cast-assets';
import type { CharacterPose } from './character-expressions';
import { useFrame } from '@react-three/fiber/native';
import * as React from 'react';
import { MathUtils } from 'three';
import { getExpressionPose } from './character-expressions';

type ValentinaCharacterProps = {
  expression: ValentinaExpression;
};

/**
 * Валентина = Nona Rosa in `CHARACTER.md` (see `cast-assets.ts`'s mapping
 * comment): 72, grandmother-in-law, silver hair in a tidy bun, warm smile,
 * kind eyes, knitted burgundy cardigan, cream blouse, small gold earrings.
 * These are that palette, not arbitrary picks.
 */
const SKIN_COLOR = '#E8B48F';
const HAIR_COLOR = '#C9C4BC';
const CARDIGAN_COLOR = '#7A2E35';
/** The cardigan's front edges, one step darker so they read against the body. */
const CARDIGAN_EDGE_COLOR = '#63242A';
const BLOUSE_COLOR = '#F3ECDE';
const EYEBROW_COLOR = '#A8A29A';
const EYE_WHITE_COLOR = '#FBF6EC';
const IRIS_COLOR = '#6B4A34';
const PUPIL_COLOR = '#3B2A22';
const LIP_COLOR = '#B4666B';
const MOUTH_INNER_COLOR = '#57262A';
const BLUSH_COLOR = '#E39A87';
const EARRING_COLOR = '#D4AF6A';

/**
 * The camera (`persona-face.tsx`) is fixed at z 2.6 with a 28° vertical fov,
 * so the frustum is 2 · 2.6 · tan(14°) ≈ 1.30 units tall at the origin. At
 * `BUST_SCALE` the head (chin -0.44 to bun top 0.50 in bust units) measures
 * 0.87 units and its silhouette sits near z 0.05, where the frustum is 1.27
 * tall — the head fills ~69% of the panel, inside `CHARACTER.md`'s "the face
 * should occupy roughly 65–70% of the image". `ROOT_BASE_Y` then drops her so
 * the bun clears the top edge by ~0.03 and the cardigan owns the bottom ~20%
 * of the panel: "head to upper chest" framing.
 */
const BUST_SCALE = 0.93;
const ROOT_BASE_Y = 0.12;

/**
 * A constant yaw plus the idle sway keeps her between 4.6° and 9.8° off
 * head-on for the whole cycle — `CHARACTER.md`'s "very slight 3/4 angle
 * (5–10°)" — and swings the bun out of the head's own silhouette so the
 * hairstyle reads from the front.
 */
const BASE_YAW_RAD = 0.125;

/**
 * Idle motion, all of it "slow movements ... gentle nods ... relaxed
 * shoulders" (CHARACTER.md, Nona Rosa's motion personality). The breath
 * period is 4.4s ≈ 14 breaths/min, a calm adult resting rate, and moves the
 * whole bust — shoulders included — as one piece. The three periods are
 * mutually incommensurate so the composite never visibly repeats or snaps
 * into lockstep, which is what makes small-amplitude idles read as alive
 * rather than mechanical.
 */
const BREATH_PERIOD_S = 4.4;
const BREATH_AMPLITUDE = 0.018;
const SWAY_PERIOD_S = 7.5;
const SWAY_AMPLITUDE = 0.045;
const NOD_PERIOD_S = 5.3;
const NOD_AMPLITUDE_RAD = 0.022;

/**
 * `headTilt` is -1..1 but the expression table only reaches 0.2 (thinking),
 * so the max has to be generous for the cue to register at all: 0.45 rad
 * turns thinking into 5.2° of roll and listening into 3.1°. The yaw riding
 * along with it is what separates a curious lean from a stiff roll.
 */
const TILT_MAX_RAD = 0.45;
const HEAD_YAW_MAX_RAD = 0.22;
const TILT_LERP_SPEED = 1.8;
const POSE_LERP_SPEED = 3.2;

/**
 * Spontaneous blink rate at rest is roughly every 3–6s; the 0.16s lid close
 * is at the slow end of the human 0.1–0.15s range, which is the cheapest way
 * to make a 72-year-old read as unhurried.
 */
const BLINK_MIN_INTERVAL_S = 3;
const BLINK_MAX_INTERVAL_S = 6.2;
const BLINK_DURATION_S = 0.16;

/**
 * Shared between the geometry and the per-frame code, which overwrites these
 * axes every frame and would otherwise drift away from the JSX values.
 */
const BROW_BASE_Y = 0.128;
const BROW_RAISE_RANGE = 0.07;
const MOUTH_Y = -0.275;
const UPPER_LIP_REST_Y = 0.021;
const LOWER_LIP_REST_Y = -0.018;

/**
 * Lip travel on open: the jaw carries the lower lip more than twice as far
 * as the upper lip rises, so "speaking"/"surprised" read as a jaw drop.
 */
const UPPER_LIP_LIFT = 0.022;
const LOWER_LIP_DROP = 0.05;
const LIP_ARC_RADIUS = 0.1;
const LIP_CURVE_BASE = 0.34;
const LIP_CURVE_GAIN = 0.42;
const LIP_CURVE_MIN = 0.12;
const LIP_WIDTH_BASE = 0.72;
const LIP_WIDTH_GAIN = 0.1;
const LIP_DEPTH_SCALE = 0.45;

/**
 * The head tilts about the top of the neck rather than its own centre, so a
 * tilt reads as a head tilt against still shoulders instead of the whole
 * bust leaning. The two vectors must stay exact negatives: the inner group
 * undoes the pivot offset so every face measurement below can stay in
 * head-centre coordinates.
 */
const HEAD_PIVOT: [number, number, number] = [0, -0.3, -0.05];
const HEAD_PIVOT_UNDO: [number, number, number] = [0, 0.3, 0.05];

const SIDES = [1, -1] as const;

/**
 * How far each eyeball is splayed off dead-ahead by sitting on the curve of
 * the head: atan(0.421 / 0.9068) for the socket direction used below. The eye
 * group is rotated by it so the visible sclera cap is symmetric, and the iris
 * is counter-rotated by it so it still faces the camera. Rotating only one of
 * the two is what put a grey sclera crescent on the outer side of each eye on
 * device — a camera-facing iris on a splayed eyeball is off-centre by
 * `iris z · sin(splay)`, ~0.044, which is over half the cap's radius.
 */
const EYE_SPLAY_RAD = 0.435;

/**
 * The upper lid is a real occluding surface, not a scale trick. Squashing the
 * eyeball — what this did before — leaves the sclera permanently ringing the
 * iris at rest, which on device read as googly eyes and was the single worst
 * thing about the face. Now skin covers everything above local y 0.033,
 * leaving a 0.116 opening — shorter than the 0.12 iris, so the iris fills it
 * top to bottom and bare sclera survives only as slivers either side. That is
 * also why there is no matching lower lid: covering the bottom sclera needs a
 * shape standing ~0.035 proud of the cheek, which on device read as an
 * under-eye bag, and the iris already does the job for free.
 *
 * The lid is a sphere 0.005 wider than the eyeball, held 0.0791 off-centre,
 * and it *sweeps* on x rather than sliding on y — two spheres always meet in
 * a circle, so rotating the offset direction rotates the covered cap while
 * the lid keeps hugging the eyeball. Pointing the offset at +y covers above
 * 0.033; swinging it to +z covers the whole front, i.e. a shut eye.
 *
 * Translating a thin lid down was the first attempt and it silently did not
 * work: a lid only 0.041 tall drops clear of the eyeball's own centre before
 * it can reach the far side, so the top half of the eye stayed open. Frame
 * analysis of an 8s screen recording caught it — iris pixels never fell below
 * 91% of their maximum across 160 frames, when a blink should take them to
 * nearly zero. Verify blinks that way, not from stills.
 */
const LID_SPHERE_RADIUS = 0.105;
const LID_OFFSET_Y = 0.0791;
const LID_CLOSE_RAD = Math.PI / 2;
const LID_WIDEN_RAD = 0.12;

type BustRefs = {
  rootRef: React.RefObject<Group | null>;
  headRef: React.RefObject<Group | null>;
  leftEyeRef: React.RefObject<Group | null>;
  rightEyeRef: React.RefObject<Group | null>;
  leftLidRef: React.RefObject<Group | null>;
  rightLidRef: React.RefObject<Group | null>;
  leftBrowRef: React.RefObject<Mesh | null>;
  rightBrowRef: React.RefObject<Mesh | null>;
  upperLipRef: React.RefObject<Mesh | null>;
  lowerLipRef: React.RefObject<Mesh | null>;
  mouthCavityRef: React.RefObject<Mesh | null>;
};

type EyeRefs = Pick<BustRefs, 'leftEyeRef' | 'rightEyeRef' | 'leftLidRef' | 'rightLidRef'>;

function randomBlinkDelay() {
  return BLINK_MIN_INTERVAL_S + Math.random() * (BLINK_MAX_INTERVAL_S - BLINK_MIN_INTERVAL_S);
}

function oscillate(elapsed: number, periodSeconds: number) {
  return Math.sin((elapsed / periodSeconds) * Math.PI * 2);
}

/**
 * A blink is a brief eyelid-scale dip, not a fade — matches the same
 * "squash" idea the earlier 2D version used, just driven by the render
 * clock instead of RN's `Animated`. Returns 1 (open) most of the time and
 * dips toward 0 for `BLINK_DURATION_S` around each scheduled blink.
 */
function useBlinkCycle() {
  const nextBlinkAtRef = React.useRef(randomBlinkDelay());
  const blinkStartedAtRef = React.useRef<number | null>(null);

  return React.useCallback((elapsed: number): number => {
    if (blinkStartedAtRef.current === null && elapsed >= nextBlinkAtRef.current)
      blinkStartedAtRef.current = elapsed;

    if (blinkStartedAtRef.current === null)
      return 1;

    const progress = (elapsed - blinkStartedAtRef.current) / BLINK_DURATION_S;
    if (progress >= 1) {
      blinkStartedAtRef.current = null;
      nextBlinkAtRef.current = elapsed + randomBlinkDelay();
      return 1;
    }
    return progress < 0.5 ? 1 - progress * 2 : (progress - 0.5) * 2;
  }, []);
}

/**
 * Nudges the live pose toward `expression`'s target values and applies the
 * result to the bust every frame. Split out of `ValentinaCharacter` to stay
 * under this repo's max-lines-per-function.
 *
 * `useFrame`'s callback is R3F's documented escape hatch from React's
 * render-phase purity rules: mutating Three.js `Object3D` refs
 * (`.current.position.y = ...`) every frame is the intended imperative
 * animation pattern here, not incidental prop/state mutation — hence the
 * blanket disable below rather than fighting the compiler rule mesh by
 * mesh.
 */
function useValentinaAnimation(expression: ValentinaExpression, refs: BustRefs) {
  // A copy, not the table entry: `getExpressionPose` returns the shared
  // `EXPRESSION_POSES` object and this pose is mutated in place every frame.
  const poseRef = React.useRef<CharacterPose>({ ...getExpressionPose(expression) });
  const getEyeOpenness = useBlinkCycle();

  /* eslint-disable react-compiler/react-compiler, react-hooks/immutability */
  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const target = getExpressionPose(expression);
    const poseLerp = Math.min(1, POSE_LERP_SPEED * delta);
    const pose = poseRef.current;
    pose.mouthOpen = MathUtils.lerp(pose.mouthOpen, target.mouthOpen, poseLerp);
    pose.mouthCurve = MathUtils.lerp(pose.mouthCurve, target.mouthCurve, poseLerp);
    pose.eyebrowRaise = MathUtils.lerp(pose.eyebrowRaise, target.eyebrowRaise, poseLerp);
    pose.eyeWiden = MathUtils.lerp(pose.eyeWiden, target.eyeWiden, poseLerp);
    pose.headTilt = MathUtils.lerp(pose.headTilt, target.headTilt, poseLerp);

    const root = refs.rootRef.current;
    if (root) {
      root.position.y = ROOT_BASE_Y + oscillate(elapsed, BREATH_PERIOD_S) * BREATH_AMPLITUDE;
      root.rotation.y = BASE_YAW_RAD + oscillate(elapsed, SWAY_PERIOD_S) * SWAY_AMPLITUDE;
    }

    const head = refs.headRef.current;
    if (head) {
      const tiltLerp = Math.min(1, TILT_LERP_SPEED * delta);
      head.rotation.x = oscillate(elapsed, NOD_PERIOD_S) * NOD_AMPLITUDE_RAD;
      head.rotation.z = MathUtils.lerp(head.rotation.z, pose.headTilt * TILT_MAX_RAD, tiltLerp);
      head.rotation.y = MathUtils.lerp(head.rotation.y, pose.headTilt * HEAD_YAW_MAX_RAD, tiltLerp);
    }

    const openness = getEyeOpenness(elapsed);
    const eyeScaleY = 1 + pose.eyeWiden * 0.12;
    for (const eye of [refs.leftEyeRef.current, refs.rightEyeRef.current]) {
      if (eye)
        eye.scale.y = eyeScaleY;
    }

    const lidSweep = (1 - openness) * LID_CLOSE_RAD - pose.eyeWiden * LID_WIDEN_RAD;
    for (const lid of [refs.leftLidRef.current, refs.rightLidRef.current]) {
      if (lid)
        lid.rotation.x = lidSweep;
    }

    const browY = BROW_BASE_Y + pose.eyebrowRaise * BROW_RAISE_RANGE;
    for (const brow of [refs.leftBrowRef.current, refs.rightBrowRef.current]) {
      if (brow)
        brow.position.y = browY;
    }

    applyMouthPose(refs, pose);
  });
  /* eslint-enable react-compiler/react-compiler, react-hooks/immutability */
}

/**
 * Both lip arcs are modelled as over-deep bowls and flattened on y to the
 * wanted curve, which keeps smile↔frown continuous: a negative scale mirrors
 * the arc into a frown (Three.js flips the winding order for a mirrored
 * matrix, so it still shades correctly) and passes through flat on the way,
 * instead of the 180° rotation snap the earlier single-arc mouth needed.
 * `LIP_CURVE_MIN` only exists to keep the matrix non-singular at dead flat.
 *
 * Scaling y also thins the tube, so the arc is re-centred on `MOUTH_Y` by
 * half its scaled radius — otherwise a deeper smile would walk the mouth
 * down the chin instead of lifting its corners.
 */
function applyMouthPose(refs: BustRefs, pose: CharacterPose) {
  const rawCurve = LIP_CURVE_BASE + pose.mouthCurve * LIP_CURVE_GAIN;
  const curve = rawCurve < 0 ? Math.min(rawCurve, -LIP_CURVE_MIN) : Math.max(rawCurve, LIP_CURVE_MIN);
  const width = LIP_WIDTH_BASE + pose.mouthCurve * LIP_WIDTH_GAIN;
  const centerY = MOUTH_Y + curve * LIP_ARC_RADIUS * 0.5;

  const upperLip = refs.upperLipRef.current;
  if (upperLip) {
    upperLip.position.y = centerY + UPPER_LIP_REST_Y + pose.mouthOpen * UPPER_LIP_LIFT;
    upperLip.scale.set(width, curve, LIP_DEPTH_SCALE);
  }

  const lowerLip = refs.lowerLipRef.current;
  if (lowerLip) {
    lowerLip.position.y = centerY + LOWER_LIP_REST_Y - pose.mouthOpen * LOWER_LIP_DROP;
    lowerLip.scale.set(width, curve, LIP_DEPTH_SCALE);
  }

  const cavity = refs.mouthCavityRef.current;
  if (cavity)
    cavity.scale.set(width * 0.95, 0.075 + pose.mouthOpen * 0.5, 0.38);
}

/**
 * Neck, cardigan, its front edges and the blouse. The cardigan ellipsoid is
 * 1.9 units across against a 0.73-wide head — a little over the ~2.4× head
 * widths of real shoulders, because knitwear adds bulk — and reaches the
 * panel's side edges, which is what makes the silhouette read as a bust
 * rather than a floating head. Roughness is pushed near 1 on the burgundy:
 * with no textures allowed, a fully matte response is the only cue left for
 * "knitted" against the blouse's smoother cream.
 */
function ValentinaTorso() {
  return (
    <>
      <mesh position={[0, -0.51, -0.055]}>
        <cylinderGeometry args={[0.195, 0.26, 0.42, 20]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.98, -0.05]} scale={[1, 0.42, 0.47]}>
        <sphereGeometry args={[0.95, 32, 20]} />
        <meshStandardMaterial color={CARDIGAN_COLOR} roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.55, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.25, 0.055, 10, 24]} />
        <meshStandardMaterial color={BLOUSE_COLOR} roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.7, 0.25]} scale={[0.62, 0.95, 0.18]}>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial color={BLOUSE_COLOR} roughness={0.55} />
      </mesh>
      {SIDES.map(side => (
        <mesh
          key={side}
          position={[side * 0.255, -0.75, 0.275]}
          rotation={[0, 0, side * 0.36]}
          scale={[0.34, 1, 0.12]}
        >
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial color={CARDIGAN_EDGE_COLOR} roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}

/**
 * Cranium, jaw, muzzle and nose. Same-coloured overlapping ellipsoids read
 * as one soft form, which is how a "clean jawline" and "soft facial planes"
 * are reachable with primitives: the jaw ellipsoid is 0.58 wide against the
 * cranium's 0.73 and sits 0.17 lower, so the lower face tapers instead of
 * ending in a sphere. The muzzle is what lets the lips sit proud of the face
 * without floating — it raises the skin around the mouth by ~0.012 first.
 */
function ValentinaHeadShape() {
  return (
    <>
      <mesh position={[0, 0.03, 0]} scale={[0.85, 0.95, 0.92]}>
        <sphereGeometry args={[0.43, 64, 48]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.14, 0.03]} scale={[0.86, 0.92, 0.9]}>
        <sphereGeometry args={[0.33, 64, 48]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.055, 0.355]} scale={[0.62, 1.9, 0.8]}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.16, 0.352]} scale={[1.15, 0.85, 1]}>
        <sphereGeometry args={[0.062, 16, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
      </mesh>
    </>
  );
}

/**
 * "Silver hair in a tidy bun." The cap is wider than the cranium on x, so
 * silver frames the face down to the jaw, but it is pushed back far enough
 * (z -0.06) that its front never crosses the skull's. That matters: the two
 * surfaces used to run nearly parallel across the forehead, and their
 * intersection z-fought into a visible sawtooth hairline on device.
 *
 * The hairline is the front wave's edge instead — the soft set roll an older
 * woman's hair has. It crosses the skull steeply (0.037 of separation swapped
 * over 0.03 of height), which is what makes it read as a deliberate edge
 * rather than shimmer, and it lands at y ≈ 0.258, above the brows at 0.128,
 * since `CHARACTER.md` lists "hair covering the face" under Avoid.
 *
 * The bun has to sit high, not behind: a bun on the back of the head is
 * completely invisible to this near-frontal camera — it was, on device, and
 * the hair read as a short bob. At y 0.355 it clears the cap's own crown by
 * 0.11 and breaks the top silhouette instead. Its top (0.505) is what
 * `ROOT_BASE_Y` is budgeted against, so the two move together.
 */
function ValentinaHair() {
  return (
    <>
      <mesh position={[0, 0.1, -0.06]} scale={[0.87, 0.75, 0.88]}>
        <sphereGeometry args={[0.47, 64, 48]} />
        <meshStandardMaterial color={HAIR_COLOR} roughness={0.75} />
      </mesh>
      {/* z 0.175, not 0.135. The wave has to clear the forehead by a real
          margin, not just win: at 0.135 the two surfaces ran close enough
          across the upper forehead that the depth buffer could not separate
          them, and the hairline broke into a stepped wedge of bare skin on
          device. Raising the tessellation and the canvas MSAA both failed to
          touch it; 0.04 of extra clearance fixed it outright. */}
      <mesh position={[0, 0.28, 0.175]} scale={[0.95, 0.47, 0.62]}>
        <sphereGeometry args={[0.32, 64, 48]} />
        <meshStandardMaterial color={HAIR_COLOR} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.42, -0.24]}>
        <sphereGeometry args={[0.165, 32, 24]} />
        <meshStandardMaterial color={HAIR_COLOR} roughness={0.75} />
      </mesh>
    </>
  );
}

/**
 * Ears exist only to hang the earrings off: swept-back hair covers them to
 * x 0.388, so the lobe and stud sit just outside that. Cheeks are a
 * translucent warm sphere rather than a flat patch, so they add the volume
 * "soft cheeks" asks for as well as the colour.
 */
function ValentinaEarsAndCheeks() {
  return (
    <>
      {SIDES.map(side => (
        <mesh key={side} position={[side * 0.36, -0.02, -0.03]} scale={[0.5, 1, 0.62]}>
          <sphereGeometry args={[0.085, 12, 12]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
        </mesh>
      ))}
      {SIDES.map(side => (
        <mesh key={side} position={[side * 0.355, -0.105, -0.02]}>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshStandardMaterial color={EARRING_COLOR} roughness={0.25} metalness={0.7} />
        </mesh>
      ))}
      {SIDES.map(side => (
        <mesh key={side} position={[side * 0.19, -0.15, 0.255]} scale={[1, 0.8, 0.4]}>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshStandardMaterial color={BLUSH_COLOR} roughness={0.85} transparent opacity={0.28} />
        </mesh>
      ))}
    </>
  );
}

/**
 * Two spheres of radius 0.10 seated 0.325 out from the head centre. Sphere
 * meets sphere in a circle, so the part standing outside the skull is a
 * clean round eye 0.166 across — 23% of the head's width, the "large
 * expressive eyes" of `CHARACTER.md`'s design principles — bulging only
 * 0.035, short of a bug-eye. The iris then covers 72% of that width, which
 * is the ratio that matters: on device an iris/eye ratio near 60% left a
 * wide pale ring reading as goggles rather than "kind eyes", and shrinking
 * the sclera while growing the iris halved the visible ring.
 *
 * Iris and pupil are thin discs rather than nested spheres, so neither can
 * sink into the sclera — and both sit *past* its front pole (0.104 and 0.11
 * against a 0.10 radius), because a disc parked short of the pole lets the
 * sclera's own cap poke through the middle of the iris. They face straight
 * down +z while the eyeballs splay outward, which converges the gaze on the
 * camera: "soft eye contact".
 *
 * The group's `scale.y` is what `useValentinaAnimation` drives for
 * blink/widen; squashing the whole group narrows the visible circle to a
 * slit, iris included.
 */
function ValentinaEyes({ leftEyeRef, rightEyeRef, leftLidRef, rightLidRef }: EyeRefs) {
  return (
    <>
      {[
        { eyeRef: leftEyeRef, lidRef: leftLidRef, side: 1 },
        { eyeRef: rightEyeRef, lidRef: rightLidRef, side: -1 },
      ].map(({ eyeRef, lidRef, side }) => (
        <group key={side} position={[side * 0.137, -0.009, 0.295]} rotation={[0, side * EYE_SPLAY_RAD, 0]}>
          <group ref={eyeRef}>
            <mesh>
              <sphereGeometry args={[0.1, 20, 20]} />
              <meshStandardMaterial color={EYE_WHITE_COLOR} roughness={0.35} />
            </mesh>
            <group position={[0, 0, 0.115]} rotation={[0, side * -EYE_SPLAY_RAD, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.008, 20]} />
                <meshStandardMaterial color={IRIS_COLOR} roughness={0.3} />
              </mesh>
              <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.028, 0.028, 0.006, 16]} />
                <meshStandardMaterial color={PUPIL_COLOR} roughness={0.25} />
              </mesh>
              {/* Catch-light, offset up and to +x for both eyes because a single
                  key light sits there (`persona-face.tsx`); mirroring it per eye
                  would read as two light sources. */}
              <mesh position={[0.029, 0.03, 0.003]}>
                <sphereGeometry args={[0.014, 10, 10]} />
                <meshStandardMaterial color={EYE_WHITE_COLOR} roughness={0.1} />
              </mesh>
            </group>
          </group>
          {/* Pivots at the eyeball's own centre, outside the scaled group so
              the sweep is unaffected by `eyeWiden` scaling the eye. */}
          <group ref={lidRef}>
            <mesh position={[0, LID_OFFSET_Y, 0]}>
              <sphereGeometry args={[LID_SPHERE_RADIUS, 32, 24]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}

/**
 * Tapered silver arcs rather than boxes — `CHARACTER.md` puts "expressive
 * eyebrows" first among facial features and a rectangle can't arch. The y
 * rotation is the load-bearing one: it swings each outer end 0.041 back in z,
 * which is what the forehead's own curvature drops over the brow's half
 * width, so the ends follow the face instead of floating off it.
 *
 * Seated, not stacked: at z 0.334 the brow's back half is buried in the
 * forehead and only ~0.013 of it stands out, so it reads as a marking on the
 * skin. Sitting it further forward — and thicker on y — is what made it a
 * floating slab, one of four horizontal lozenges piling up over the eye.
 * `position.y` is driven for raise/furrow.
 */
function ValentinaEyebrows({ leftBrowRef, rightBrowRef }: Pick<BustRefs, 'leftBrowRef' | 'rightBrowRef'>) {
  return (
    <>
      {[{ ref: leftBrowRef, side: 1 }, { ref: rightBrowRef, side: -1 }].map(({ ref, side }) => (
        <mesh
          key={side}
          ref={ref}
          position={[side * 0.157, BROW_BASE_Y, 0.334]}
          rotation={[0, side * 0.5, side * -0.16]}
          scale={[1, 0.22, 0.26]}
        >
          <sphereGeometry args={[0.09, 16, 12]} />
          <meshStandardMaterial color={EYEBROW_COLOR} roughness={0.85} />
        </mesh>
      ))}
    </>
  );
}

/**
 * A lip-sync rig rather than a mouth line: separate upper and lower lip arcs
 * with a dark cavity between them, so openness is a real aperture the lips
 * frame ("the mouth should be designed for lip sync"). At rest the two arcs
 * overlap by 0.004 and the mouth reads shut. The lower lip's tube is the
 * thicker of the two, which is both anatomically the case and what keeps a
 * smile from reading as a grimace. `applyMouthPose` drives all three.
 */
function ValentinaMouth({ upperLipRef, lowerLipRef, mouthCavityRef }: Pick<BustRefs, 'upperLipRef' | 'lowerLipRef' | 'mouthCavityRef'>) {
  return (
    <>
      <mesh ref={mouthCavityRef} position={[0, MOUTH_Y, 0.276]} scale={[0.68, 0.1, 0.38]}>
        <sphereGeometry args={[0.1, 20, 12]} />
        <meshStandardMaterial color={MOUTH_INNER_COLOR} roughness={0.6} />
      </mesh>
      <mesh ref={upperLipRef} position={[0, MOUTH_Y + UPPER_LIP_REST_Y, 0.293]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[LIP_ARC_RADIUS, 0.04, 8, 24, Math.PI]} />
        <meshStandardMaterial color={LIP_COLOR} roughness={0.45} />
      </mesh>
      <mesh ref={lowerLipRef} position={[0, MOUTH_Y + LOWER_LIP_REST_Y, 0.293]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[LIP_ARC_RADIUS, 0.058, 8, 24, Math.PI]} />
        <meshStandardMaterial color={LIP_COLOR} roughness={0.45} />
      </mesh>
    </>
  );
}

/**
 * Валентина's bust, built from primitive Three.js geometry — there's no
 * GLTF model for her (see `persona-face.tsx`'s own comment on why). This
 * is a deliberately simple, stylized approximation of `CHARACTER.md`'s
 * brief, not an attempt at its Pixar-concept-art fidelity, which
 * primitives can't reach.
 *
 * All measurements in this file are in head-centre units: the cranium's
 * centre is the origin, the head is 0.88 tall, and `BUST_SCALE` /
 * `ROOT_BASE_Y` are the only things that place her in the camera's frame.
 */
export function ValentinaCharacter({ expression }: ValentinaCharacterProps) {
  const refs: BustRefs = {
    rootRef: React.useRef<Group>(null),
    headRef: React.useRef<Group>(null),
    leftEyeRef: React.useRef<Group>(null),
    rightEyeRef: React.useRef<Group>(null),
    leftLidRef: React.useRef<Group>(null),
    rightLidRef: React.useRef<Group>(null),
    leftBrowRef: React.useRef<Mesh>(null),
    rightBrowRef: React.useRef<Mesh>(null),
    upperLipRef: React.useRef<Mesh>(null),
    lowerLipRef: React.useRef<Mesh>(null),
    mouthCavityRef: React.useRef<Mesh>(null),
  };

  useValentinaAnimation(expression, refs);

  return (
    <group
      ref={refs.rootRef}
      position={[0, ROOT_BASE_Y, 0]}
      rotation={[0, BASE_YAW_RAD, 0]}
      scale={BUST_SCALE}
    >
      <ValentinaTorso />
      <group ref={refs.headRef} position={HEAD_PIVOT}>
        <group position={HEAD_PIVOT_UNDO}>
          <ValentinaHeadShape />
          <ValentinaHair />
          <ValentinaEarsAndCheeks />
          <ValentinaEyes
            leftEyeRef={refs.leftEyeRef}
            rightEyeRef={refs.rightEyeRef}
            leftLidRef={refs.leftLidRef}
            rightLidRef={refs.rightLidRef}
          />
          <ValentinaEyebrows leftBrowRef={refs.leftBrowRef} rightBrowRef={refs.rightBrowRef} />
          <ValentinaMouth
            upperLipRef={refs.upperLipRef}
            lowerLipRef={refs.lowerLipRef}
            mouthCavityRef={refs.mouthCavityRef}
          />
        </group>
      </group>
    </group>
  );
}
