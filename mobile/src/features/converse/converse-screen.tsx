import type { MediaStream } from 'react-native-webrtc';
import type { ConversePhase } from './use-converse-session';
import type { LiveConversePhase } from './use-live-converse-session';
import Env from 'env';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';

import { acquireLocalAudioStream, releaseLocalAudioStream } from '@/lib/audio/webrtc-local-audio-stream';
import { realParamsOrBarePath } from '@/lib/navigation/loop-nav-params';
import { useLearner } from './api';
import { FrequencyBackground } from './components/frequency-background';
import { HoldToThinkButton } from './components/hold-to-think-button';
import { InputModeToggle } from './components/input-mode-toggle';
import { LevelMeter } from './components/level-meter';
import { LiveTranscript } from './components/live-transcript';
import { PersonaPortrait3D } from './components/persona-portrait-3d';
import { SuggestionChips } from './components/suggestion-chips';
import { TextInputBar } from './components/text-input-bar';
import { Transcript } from './components/transcript';
import { useConverseSession } from './use-converse-session';
import { useHardwareBackToOpen } from './use-hardware-back-to-open';
import { useLiveConverseSession } from './use-live-converse-session';
import { useMicCapture } from './use-mic-capture';
import { useNativePcmCapture } from './use-native-pcm-capture';

/**
 * Whether the shared reveal slot shows transliteration instead of
 * translation (ticket #30 AC #3). Real when a `learnerId` route param is
 * present (set by Open's Answer flow, ticket #24), reading the learner's
 * actual onboarding answer — defaults to translation (false) with no
 * real learner, matching this codebase's established "real when present,
 * fixture-equivalent default otherwise" pattern.
 */
function useTranslitEnabled(learnerId: string | undefined) {
  const { data: learner } = useLearner({
    variables: { learnerId: learnerId ?? '' },
    enabled: Boolean(learnerId),
  });
  return learner?.translitEnabled ?? false;
}

/**
 * Acquires the react-native-webrtc AEC-path audio stream for the screen's
 * lifetime (ticket #10) — see `webrtc-local-audio-stream.ts` for why this
 * exists even though nothing plays it back yet. Scripted-demo only:
 * docs/adr/0017 ultimately rejected the WebRTC-peer path for the real
 * pipeline in favor of the WS-chunk transport `use-native-pcm-capture.ts`
 * implements, so `LiveConverseScreen` deliberately does not call this —
 * running both a `react-native-webrtc` `getUserMedia` capture and the
 * native `AudioRecord`-based one at once would be two independent
 * consumers competing for the same microphone, an avoidable, unverified
 * risk this sidesteps by simply not acquiring a stream nothing in the
 * live path ever reads from.
 */
function useWebrtcAecStream() {
  React.useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    acquireLocalAudioStream().then((acquired) => {
      if (cancelled) {
        releaseLocalAudioStream(acquired);
        return;
      }
      stream = acquired;
    }).catch(() => {
      // This stream is groundwork for a later pipeline ticket — nothing in
      // this ticket depends on it, so a failure here (e.g. no hardware mic
      // available, as in this environment's simulator) shouldn't block the
      // screen or the expo-audio-driven level meter from working.
    });
    return () => {
      cancelled = true;
      if (stream)
        releaseLocalAudioStream(stream);
    };
  }, []);
}

function useElapsedClock() {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  React.useEffect(() => {
    const intervalId = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** After the last turn lands, how long to let it sit before moving on to Debrief. Scripted-demo only — a live conversation has no fixed script to exhaust, so it has no equivalent auto-advance; the learner always ends it manually via "End". */
const AUTO_DEBRIEF_DELAY_MS = 1500;

/**
 * `LevelMeter`'s `phase` prop only distinguishes 'listening' and
 * 'thinking' from everything else (see `level-meter.tsx`) — this maps
 * the live pipeline's richer `LiveConversePhase` onto that narrower
 * shape rather than widening `LevelMeter` itself. 'speaking' (her TTS
 * audio is actually playing) maps to 'thinking' ("she's talking" is
 * exactly what that phase's own label already says) — a genuine fit, not
 * a lossy approximation.
 */
function mapLivePhaseToMeterPhase(phase: LiveConversePhase): ConversePhase {
  if (phase === 'listening')
    return 'listening';
  if (phase === 'thinking' || phase === 'speaking')
    return 'thinking';
  return 'idle';
}

type ConverseHeaderProps = {
  clock: string;
  onBack: () => void;
};

/** Shared between both screens below — identical in either mode. */
function ConverseHeader({ clock, onBack }: ConverseHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-[22px] pt-[60px] pb-[12px]">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="back">
        <Text className="text-[15px] text-accent">‹</Text>
      </Pressable>
      <Text className="font-serif text-[13px] text-ink/60">Валентина Сергеевна</Text>
      <Text className="font-mono-medium text-[10px] text-ink/40">{clock}</Text>
    </View>
  );
}

type ConverseFooterRowProps = {
  showHoldButton: boolean;
  holding: boolean;
  onHoldOn: () => void;
  onHoldOff: () => void;
  onEnd: () => void;
};

/** The bottom row's hold-button/End layout — also shared, since both modes place it identically. */
function ConverseFooterRow({ showHoldButton, holding, onHoldOn, onHoldOff, onEnd }: ConverseFooterRowProps) {
  return (
    <View className="mt-[14px] min-h-[56px] flex-row items-center justify-between gap-[12px]">
      <View className="w-[62px]" />
      {showHoldButton && (
        <HoldToThinkButton holding={holding} onHoldOn={onHoldOn} onHoldOff={onHoldOff} />
      )}
      <Pressable onPress={onEnd} accessibilityRole="button" accessibilityLabel="end">
        <Text className="w-[62px] text-right text-[13px] text-ink/50">End</Text>
      </Pressable>
    </View>
  );
}

type ScriptedConverseScreenProps = {
  learnerId: string | undefined;
  sessionId: string | undefined;
};

/**
 * The scripted demo (ticket #3) — turn-taking is canned dialogue, no live
 * STT/LLM/TTS pipeline. Rendered whenever `LiveConverseScreen`'s
 * requirements (a real learner, session, and voice-service credential —
 * see `ConverseScreen` below) aren't all present, same "real when
 * present, fixture-equivalent default otherwise" pattern as
 * `useTranslitEnabled`. Layout, states, and copy per `Initial mockup
 * request/design_handoff_conversation_loop/README.md` ("2. Converse").
 *
 * The level meter is driven by real microphone amplitude (ticket #10)
 * via `use-mic-capture.ts`, even though turn-taking itself is scripted.
 */
function ScriptedConverseScreen({ learnerId, sessionId }: ScriptedConverseScreenProps) {
  const router = useRouter();
  const translitEnabled = useTranslitEnabled(learnerId);
  const clock = useElapsedClock();
  const {
    phase,
    turns,
    holding,
    holdSeen,
    revealed,
    chipsVisible,
    scriptExhausted,
    speak,
    holdOn,
    holdOff,
    toggleReveal,
  } = useConverseSession();
  const { amplitude } = useMicCapture({ paused: holding });
  useWebrtcAecStream();

  const goToDebrief = React.useCallback(() => {
    router.replace(realParamsOrBarePath('/debrief', { sessionId, learnerId }));
  }, [router, sessionId, learnerId]);

  const goBackToOpen = React.useCallback(() => {
    router.replace(realParamsOrBarePath('/open', { learnerId }));
  }, [router, learnerId]);

  React.useEffect(() => {
    if (!scriptExhausted)
      return undefined;
    const timeoutId = setTimeout(goToDebrief, AUTO_DEBRIEF_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [scriptExhausted, goToDebrief]);

  return (
    <View className="flex-1 bg-paper">
      <ConverseHeader clock={clock} onBack={goBackToOpen} />

      <View className="px-[22px]">
        {/* Scripted demo's `phase` collapses "generating" and "audio playing" into one 'thinking' — same mapping LevelMeter's label already relies on (see mapLivePhaseToMeterPhase's comment). */}
        <PersonaPortrait3D background={<FrequencyBackground active={phase === 'thinking'} />} />
      </View>

      <Transcript
        turns={turns}
        thinking={phase === 'thinking'}
        revealed={revealed}
        onToggleReveal={toggleReveal}
        translitEnabled={translitEnabled}
      />

      <View className="px-[22px] pt-[14px] pb-[40px]">
        <Text className="font-mono-medium mb-[11px] text-center text-[11px] tracking-[0.05em] text-ink/55">
          {translitEnabled ? 'Tap her line for a transliteration' : 'Tap her line for a translation'}
        </Text>

        {chipsVisible && <SuggestionChips onPress={speak} />}

        <LevelMeter phase={phase} holding={holding} amplitude={amplitude} />

        <ConverseFooterRow
          showHoldButton={holdSeen}
          holding={holding}
          onHoldOn={holdOn}
          onHoldOff={holdOff}
          onEnd={goToDebrief}
        />
      </View>
    </View>
  );
}

type LiveConverseScreenProps = {
  learnerId: string;
  sessionId: string;
  voiceServiceToken: string;
};

/**
 * The real pipeline (docs/adr/0017, docs/adr/0023) — STT → persona LLM →
 * TTS over a live voice-service connection, mic audio via the native
 * `expo-live-pcm-capture` module (Android only). Rendered once a real
 * learner, session, and voice-service token are all present (see
 * `ConverseScreen` below); `ScriptedConverseScreen` handles every other
 * case.
 *
 * Still unverified end to end on a physical device (docs/adr/0023's own
 * "what's still not done") — every piece here is real and independently
 * tested, but nothing has proven the full round trip on real hardware.
 */
function LiveConverseScreen({ learnerId, sessionId, voiceServiceToken }: LiveConverseScreenProps) {
  const router = useRouter();
  const clock = useElapsedClock();
  const live = useLiveConverseSession({
    url: Env.EXPO_PUBLIC_VOICE_SERVICE_URL,
    token: voiceServiceToken,
    learnerId,
    sessionId,
  });
  // Continuous open-mic capture while it's her turn to listen (PRD §6.2:
  // no press-to-speak), same as `use-mic-capture.ts`'s own `paused:
  // holding` convention — paused during a hold (nothing to send while the
  // server's been told to ignore audio anyway) and while typing in text
  // mode (ticket #32: text mode "bypasses audio entirely"). Deliberately
  // NOT also paused during her own turn ('thinking'/'speaking') — no
  // half-duplex gating is implemented here. Echo cancellation remains the
  // structural gap docs/adr/0017 already disclosed; this doesn't change
  // that either way.
  const capture = useNativePcmCapture({
    enabled: !live.holding && live.mode === 'voice',
    onChunk: live.sendAudioChunk,
  });

  const goToDebrief = React.useCallback(() => {
    router.replace(realParamsOrBarePath('/debrief', { sessionId, learnerId }));
  }, [router, sessionId, learnerId]);

  const goBackToOpen = React.useCallback(() => {
    router.replace(realParamsOrBarePath('/open', { learnerId }));
  }, [router, learnerId]);

  const meterPhase = mapLivePhaseToMeterPhase(live.phase);

  return (
    <View className="flex-1 bg-paper">
      <ConverseHeader clock={clock} onBack={goBackToOpen} />

      <View className="px-[22px]">
        <PersonaPortrait3D background={<FrequencyBackground active={live.phase === 'speaking'} />} />
      </View>

      <LiveTranscript turns={live.turns} thinking={live.phase === 'thinking'} />

      <View className="px-[22px] pt-[14px] pb-[40px]">
        <View className="mb-[11px] items-center">
          <InputModeToggle mode={live.mode} onChange={live.setMode} />
        </View>

        {capture.error && (
          <Text className="font-mono-medium mb-[8px] text-center text-[10px] tracking-[0.03em] text-red-700/70">
            {`mic: ${capture.error}`}
          </Text>
        )}

        {live.mode === 'voice'
          ? (
              <LevelMeter phase={meterPhase} holding={live.holding} amplitude={capture.amplitude} />
            )
          : (
              <TextInputBar onSubmit={live.submitText} disabled={live.phase === 'thinking' || live.phase === 'speaking'} />
            )}

        <ConverseFooterRow
          showHoldButton={live.mode === 'voice' && live.holdSeen}
          holding={live.holding}
          onHoldOn={live.holdOn}
          onHoldOff={live.holdOff}
          onEnd={goToDebrief}
        />
      </View>
    </View>
  );
}

/**
 * Ticket #25: `learnerId`/`sessionId` are sent by Open's navigation
 * (`use-open-screen.ts`'s `router.replace`); `voiceServiceToken`
 * (docs/adr/0023) is sent alongside them for a real session. All three
 * present means a real, live conversation; anything less (no real
 * learner at all, or the daily-cap "come back tomorrow" path that never
 * reaches session creation) falls back to the scripted demo — the same
 * "real when present" branch this codebase already uses elsewhere
 * (`useTranslitEnabled` above).
 *
 * Split into two full components rather than one that conditionally
 * calls `useConverseSession` vs. `useLiveConverseSession` — React's
 * rules of hooks don't allow a hook call to depend on a runtime
 * condition within a single component.
 */
export function ConverseScreen() {
  const { learnerId, sessionId, voiceServiceToken } = useLocalSearchParams<{
    learnerId?: string;
    sessionId?: string;
    voiceServiceToken?: string;
  }>();

  useHardwareBackToOpen(learnerId);

  if (learnerId && sessionId && voiceServiceToken) {
    return (
      <LiveConverseScreen
        learnerId={learnerId}
        sessionId={sessionId}
        voiceServiceToken={voiceServiceToken}
      />
    );
  }

  return <ScriptedConverseScreen learnerId={learnerId} sessionId={sessionId} />;
}
