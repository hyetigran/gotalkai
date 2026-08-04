import Env from 'env';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { realParamsOrBarePath } from '@/lib/navigation/loop-nav-params';
import { FrequencyBackground } from './components/frequency-background';
import { HoldToTalkButton } from './components/hold-to-talk-button';
import { LiveTranscript } from './components/live-transcript';
import { PersonaPortrait3D } from './components/persona-portrait-3d';
import { useHardwareBackToOpen } from './use-hardware-back-to-open';
import { useHoldToTalk } from './use-hold-to-talk';
import { useLiveConverseSession } from './use-live-converse-session';

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

type ConverseHeaderProps = {
  clock: string;
  onBack: () => void;
  onEnd: () => void;
};

/**
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
      <Text className="font-sans-semibold text-[13px] text-ink/60">Valentina Sergeevna</Text>
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
 * Ticket #25: `learnerId`/`sessionId`/`voiceServiceToken` are sent by
 * Open's navigation (`use-open-screen.ts`'s `router.replace`, docs/adr/0026).
 * A learner reaches this screen with a real onboarding-created id by now
 * (`index.tsx` redirects to Session Zero first when there isn't one), so
 * the scripted no-credentials demo this screen used to fall back to
 * (ticket #3) was removed rather than kept as dead weight — see git
 * history for `ScriptedConverseScreen` if it's ever needed again. Any
 * params still missing (e.g. a stale/malformed deep link) bounces back
 * to Open instead of rendering a broken live session.
 *
 * Still unverified end to end on a physical device (docs/adr/0026's own
 * "what's still not done") — every piece here is real and independently
 * tested, but nothing has proven the full round trip on real hardware.
 */
export function ConverseScreen() {
  const router = useRouter();
  const { learnerId, sessionId, voiceServiceToken } = useLocalSearchParams<{
    learnerId?: string;
    sessionId?: string;
    voiceServiceToken?: string;
  }>();
  const hasRealSession = Boolean(learnerId && sessionId && voiceServiceToken);

  useHardwareBackToOpen(learnerId);

  React.useEffect(() => {
    if (!hasRealSession)
      router.replace(realParamsOrBarePath('/open', { learnerId }));
  }, [hasRealSession, learnerId, router]);

  const clock = useElapsedClock();
  const live = useLiveConverseSession({
    url: Env.EXPO_PUBLIC_VOICE_SERVICE_URL,
    token: voiceServiceToken ?? '',
    learnerId: learnerId ?? '',
    sessionId: sessionId ?? '',
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

  /**
   * Navigates immediately — `POST /sessions/:id/end` (a real LLM call,
   * not a quick "mark ended") is triggered by the Debrief screen itself
   * once it lands and sees `summary.endedAt: null`, not awaited here.
   * Debrief is what shows the resulting "analysing…" state, so it's the
   * one that should own starting the wait, not Converse blocking on a
   * call with nothing on this screen to show for it.
   */
  const goToDebrief = React.useCallback(() => {
    router.replace(realParamsOrBarePath('/debrief', { sessionId, learnerId }));
  }, [router, sessionId, learnerId]);

  const goBackToOpen = React.useCallback(() => {
    router.replace(realParamsOrBarePath('/open', { learnerId }));
  }, [router, learnerId]);

  const insets = useSafeAreaInsets();

  if (!hasRealSession)
    return null;

  return (
    <View className="flex-1 bg-page">
      <ConverseHeader clock={clock} onBack={goBackToOpen} onEnd={goToDebrief} />

      <View className="px-[22px]">
        <PersonaPortrait3D background={<FrequencyBackground active={live.phase === 'speaking'} />} />
      </View>

      <LiveTranscript turns={live.turns} thinking={live.phase === 'thinking'} onReveal={live.markRevealed} />

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
        <View className="mt-[14px] min-h-[56px]">
          <HoldToTalkButton
            pressed={holdToTalk.pressed}
            disabled={live.phase !== 'listening'}
            amplitude={holdToTalk.amplitude}
            onPressIn={holdToTalk.onPressIn}
            onPressOut={holdToTalk.onPressOut}
          />
        </View>
      </View>
    </View>
  );
}
