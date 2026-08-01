import type { MediaStream } from 'react-native-webrtc';
import Env from 'env';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { acquireLocalAudioStream, releaseLocalAudioStream } from '@/lib/audio/webrtc-local-audio-stream';
import { realParamsOrBarePath } from '@/lib/navigation/loop-nav-params';
import { useLearner } from './api';
import { FrequencyBackground } from './components/frequency-background';
import { HoldToTalkButton } from './components/hold-to-talk-button';
import { HoldToThinkButton } from './components/hold-to-think-button';
import { LevelMeter } from './components/level-meter';
import { LiveTranscript } from './components/live-transcript';
import { PersonaPortrait3D } from './components/persona-portrait-3d';
import { SuggestionChips } from './components/suggestion-chips';
import { Transcript } from './components/transcript';
import { useConverseSession } from './use-converse-session';
import { useHardwareBackToOpen } from './use-hardware-back-to-open';
import { useHoldToTalk } from './use-hold-to-talk';
import { useLiveConverseSession } from './use-live-converse-session';
import { useMicCapture } from './use-mic-capture';

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

type ConverseHeaderProps = {
  clock: string;
  onBack: () => void;
  onEnd: () => void;
};

/**
 * Shared between both screens below — identical in either mode.
 *
 * UAT: "not sure I like where 'end' is located [bottom footer] — it
 * probably should be in the top right in the header." Moved here,
 * alongside the clock, out of `ConverseFooterRow` — see that component's
 * own comment for what's left there.
 */
function ConverseHeader({ clock, onBack, onEnd }: ConverseHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-[22px] pt-[60px] pb-[12px]">
      {/* Visually just the "‹" glyph (~15px) — same "raise the hit area, keep the visual
          size" treatment the mockup README's Accessibility section calls for on the
          suggestion chips (34px, still below the 44px guideline). modal.tsx's CloseButton
          uses 20px of hitSlop on a 24px icon; this glyph is smaller still, and 20px wasn't
          enough in practice — tripled. */}
      <Pressable
        onPress={onBack}
        hitSlop={{ top: 60, bottom: 60, left: 60, right: 60 }}
        accessibilityRole="button"
        accessibilityLabel="back"
      >
        <Text className="text-[15px] text-accent">‹</Text>
      </Pressable>
      <Text className="font-serif text-[13px] text-ink/60">Валентина Сергеевна</Text>
      <View className="flex-row items-center gap-[12px]">
        <Text className="font-mono-medium text-[10px] text-ink/40">{clock}</Text>
        <Pressable onPress={onEnd} hitSlop={{ top: 20, bottom: 20, left: 12, right: 20 }} accessibilityRole="button" accessibilityLabel="end">
          <Text className="text-[13px] text-ink/50">End</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The bottom row — just the hold button now (a slot, not a hardcoded
 * component: the scripted demo's hold-to-think and the live pipeline's
 * hold-to-talk, ticket #40, are different buttons with different
 * semantics — pause vs. the only way to talk at all — not the same
 * component with different props). "End" moved to `ConverseHeader`
 * (see its own comment); this row is what's left, shared purely for the
 * consistent spacing/margin, not because there's meaningful layout left
 * to share.
 */
function ConverseFooterRow({ holdButton }: { holdButton?: React.ReactNode }) {
  return (
    <View className="mt-[14px] min-h-[56px]">
      {holdButton}
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
      <ConverseHeader clock={clock} onBack={goBackToOpen} onEnd={goToDebrief} />

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
          holdButton={holdSeen && <HoldToThinkButton holding={holding} onHoldOn={holdOn} onHoldOff={holdOff} />}
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
 * The real pipeline (docs/adr/0017, docs/adr/0026) — STT → persona LLM →
 * TTS over a live voice-service connection, mic audio via the native
 * `expo-live-pcm-capture` module (Android only). Rendered once a real
 * learner, session, and voice-service token are all present (see
 * `ConverseScreen` below); `ScriptedConverseScreen` handles every other
 * case.
 *
 * Still unverified end to end on a physical device (docs/adr/0026's own
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
  // Ticket #40 (PRD §6.2/§7.9): hold-to-talk, not open-mic. The mic is
  // only ever capturing while this button is physically held — a real
  // echo/false-interruption failure on a physical device (no acoustic
  // echo cancellation on the raw PCM capture path: her own TTS audio
  // re-entering the mic read as a barge-in, cancelling her audio before
  // it played and looping the session into a silent fallback forever)
  // led to trading away the open-mic model entirely rather than trying to
  // fix the acoustic problem. See PRD §7.10 and risk 10 (§14) for the
  // full reasoning and the tradeoff (backchanneling and barge-in no
  // longer work). UAT: "remove voice and text options. there should be
  // no text input. only voice" — mode stays permanently 'voice'; the
  // underlying text-input capability (ticket #32) stays real and tested
  // in use-live-converse-session.ts, just unreachable from this UI.
  const holdToTalk = useHoldToTalk({
    canTalk: live.phase === 'listening',
    sendAudioChunk: live.sendAudioChunk,
  });

  const goToDebrief = React.useCallback(() => {
    router.replace(realParamsOrBarePath('/debrief', { sessionId, learnerId }));
  }, [router, sessionId, learnerId]);

  const goBackToOpen = React.useCallback(() => {
    router.replace(realParamsOrBarePath('/open', { learnerId }));
  }, [router, learnerId]);

  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-paper">
      <ConverseHeader clock={clock} onBack={goBackToOpen} onEnd={goToDebrief} />

      <View className="px-[22px]">
        <PersonaPortrait3D background={<FrequencyBackground active={live.phase === 'speaking'} />} />
      </View>

      <LiveTranscript turns={live.turns} thinking={live.phase === 'thinking'} />

      {/*
        UAT: "the chat window appears to be a bit cutoff at the bottom" —
        this screen (like the rest of this codebase, per a repo-wide grep)
        never accounted for the gesture-nav-bar safe area at all, only a
        fixed `pb-[40px]`. `insets.bottom` is 0 on devices with none (a
        physical home button), so this is additive, not a regression
        there.
      */}
      <View className="px-[22px] pt-[14px]" style={{ paddingBottom: 40 + insets.bottom }}>
        {holdToTalk.error && (
          <Text className="font-mono-medium mb-[8px] text-center text-[10px] tracking-[0.03em] text-red-700/70">
            {`mic: ${holdToTalk.error}`}
          </Text>
        )}

        {/* UAT: "move the frequency icon animation ... inside the hold to talk button" — LevelMeter's separate row is gone; HoldToTalkButton renders its own bars now (see that component's own comment). */}
        <ConverseFooterRow
          holdButton={(
            <HoldToTalkButton
              pressed={holdToTalk.pressed}
              disabled={live.phase !== 'listening'}
              amplitude={holdToTalk.amplitude}
              onPressIn={holdToTalk.onPressIn}
              onPressOut={holdToTalk.onPressOut}
            />
          )}
        />
      </View>
    </View>
  );
}

/**
 * Ticket #25: `learnerId`/`sessionId` are sent by Open's navigation
 * (`use-open-screen.ts`'s `router.replace`); `voiceServiceToken`
 * (docs/adr/0026) is sent alongside them for a real session. All three
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
