import type { MediaStream } from 'react-native-webrtc';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';

import { acquireLocalAudioStream, releaseLocalAudioStream } from '@/lib/audio/webrtc-local-audio-stream';
import { useLearner } from './api';
import { HoldToThinkButton } from './components/hold-to-think-button';
import { LevelMeter } from './components/level-meter';
import { SuggestionChips } from './components/suggestion-chips';
import { Transcript } from './components/transcript';
import { useConverseSession } from './use-converse-session';
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
 * exists even though nothing plays it back yet.
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

/** After the last turn lands, how long to let it sit before moving on to Debrief. */
const AUTO_DEBRIEF_DELAY_MS = 1500;

/**
 * The Converse screen — turn-taking is still the scripted demo (ticket
 * #3), no live STT/LLM/TTS pipeline yet. Layout, states, and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("2. Converse"). Part of the daily loop (ticket #9): back and "End" both
 * return to Open/advance to Debrief via the real router; reaching the end
 * of the scripted turns also auto-advances to Debrief after a short delay,
 * so finishing the script isn't a dead end if the learner doesn't tap "End".
 *
 * The level meter is now driven by real microphone amplitude (ticket #10)
 * instead of a fake animated loop — see `use-mic-capture.ts`.
 */
export function ConverseScreen() {
  const router = useRouter();
  // Ticket #25: `sessionId` is already sent by Open's navigation (use-open-screen.ts's
  // router.replace) but was never read here — Debrief/Tomorrow need it forwarded onward for
  // their own real-data fetches to have anything to fetch. Converse's own turn-taking is still
  // the scripted demo (ticket #18's disclosed, accepted limitation) — this screen doesn't
  // consume `sessionId` itself, only relays it to the screens after it.
  const { learnerId, sessionId } = useLocalSearchParams<{ learnerId?: string; sessionId?: string }>();
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
    if (sessionId)
      router.replace({ pathname: '/debrief', params: learnerId ? { sessionId, learnerId } : { sessionId } });
    else
      router.replace('/debrief');
  }, [router, sessionId, learnerId]);

  const goBackToOpen = React.useCallback(() => {
    router.replace(learnerId ? { pathname: '/open', params: { learnerId } } : '/open');
  }, [router, learnerId]);

  React.useEffect(() => {
    if (!scriptExhausted)
      return undefined;
    const timeoutId = setTimeout(goToDebrief, AUTO_DEBRIEF_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [scriptExhausted, goToDebrief]);

  return (
    <View className="flex-1 bg-paper">
      <View className="flex-row items-center justify-between px-[22px] pt-[60px] pb-[12px]">
        <Pressable onPress={goBackToOpen} accessibilityRole="button" accessibilityLabel="back">
          <Text className="text-[15px] text-accent">‹</Text>
        </Pressable>
        <Text className="font-serif text-[13px] text-ink/60">Валентина Сергеевна</Text>
        <Text className="font-mono-medium text-[10px] text-ink/40">{clock}</Text>
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

        <View className="mt-[14px] min-h-[56px] flex-row items-center justify-between gap-[12px]">
          <View className="w-[62px]" />
          {holdSeen && (
            <HoldToThinkButton holding={holding} onHoldOn={holdOn} onHoldOff={holdOff} />
          )}
          <Pressable onPress={goToDebrief} accessibilityRole="button" accessibilityLabel="end">
            <Text className="w-[62px] text-right text-[13px] text-ink/50">End</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
