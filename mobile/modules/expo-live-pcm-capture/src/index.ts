/**
 * expo-live-pcm-capture — local Expo module (Android-only).
 *
 * Why this exists: docs/adr/0017 (§"Mic capture: no live raw-PCM source
 * exists in this stack") establishes, against actual node_modules source
 * rather than assumption, that neither `expo-audio`'s `AudioRecorder` nor
 * `react-native-webrtc`'s `MediaStream` can stream raw float PCM frames
 * to JS on Android. This module closes that gap directly with
 * `android.media.AudioRecord`, per the ADR's own conclusion that doing so
 * requires either a new native module (this) or reviving a full WebRTC
 * server-peer architecture (rejected elsewhere as too large/risky).
 *
 * Resolution: this is a *local*, unpublished module — not an npm
 * dependency. Its native (Android) side is picked up automatically by
 * `expo-modules-autolinking`'s default `nativeModulesDir` (`./modules`
 * relative to the app root — verified against
 * `node_modules/expo-modules-autolinking/src/commands/autolinkingOptions.ts`'s
 * `normalizeAutolinkingOptions`, not assumed), which the app's generated
 * `android/settings.gradle` already wires up via
 * `expoAutolinking.useExpoModules()` — no edits to `android/` needed or
 * made. Its JS side is resolved by an ordinary relative import (e.g.
 * `../../../modules/expo-live-pcm-capture` from
 * `src/features/converse/use-native-pcm-capture.ts`) rather than a path
 * alias — a `@modules/*` alias was tried and reverted, since Jest's
 * `moduleNameMapper` doesn't reliably cooperate with `jest.mock()` on a
 * directory-style aliased target (confirmed empirically). There's no
 * build step for this module either way — nothing outside this repo
 * ever consumes it.
 *
 * Scope: Android only. No iOS implementation exists (`expo-module.config.json`'s
 * `"platforms": ["android"]`, no `ios/` folder) — the physical-device
 * demo target for this ticket is Android, and iOS is explicitly out of
 * scope.
 *
 * Status (see ExpoLivePcmCaptureModule.kt and use-native-pcm-capture.ts
 * for the full disclosure): the Kotlin `AudioRecord` capture loop and
 * this JS bridge are real, written against verified `expo-modules-core`
 * APIs — not a stub. What is NOT verified, because no physical Android
 * device or emulator is available in this environment: whether
 * `AudioRecord` actually initializes with these parameters on real
 * hardware, whether the JS bridge event delivers frames at the expected
 * ~100ms cadence without drops, and whether `MediaRecorder.AudioSource.VOICE_COMMUNICATION`
 * actually engages the device's hardware AEC/NS path as intended (it's a
 * disclosed best-effort choice, not a fix for the AEC gap docs/adr/0017
 * already describes as structurally absent from this WS-chunk
 * transport).
 */
export { default as ExpoLivePcmCaptureModule } from './expo-live-pcm-capture-module';
export * from './expo-live-pcm-capture.types';
