import type { AudioStatus } from 'expo-audio';
import { createAudioPlayer } from 'expo-audio';
import * as React from 'react';

/**
 * Sequential MP3 playback for ticket #18's `tts_chunk` stream. Each chunk
 * plays via a `data:` URI — `expo-audio`'s `AudioSource` accepts a plain
 * string, and a `data:` URI is a valid string, so no separate file write
 * is needed if this works. Whether iOS/Android's underlying player
 * actually accepts `data:` URIs for audio (as opposed to only
 * `http(s)://`/`file://`) is **not verified** in this environment — see
 * docs/adr/0017. If it doesn't, the fallback is writing each chunk to a
 * temp file via `expo-file-system` and using a `file://` URI instead; not
 * implemented here since confirming it's even needed requires a device.
 *
 * `tts_chunk` messages are guaranteed to arrive in sentence order on a
 * single WebSocket connection (voice-service's synthesizeSpeech emits
 * them synchronously in order within one turn — see tts.ts/ticket #17) —
 * this plays them in receipt order, not by sorting on `sentenceIndex`.
 */
export function toDataUri(audioBase64: string): string {
  return `data:audio/mpeg;base64,${audioBase64}`;
}

export function useTtsPlayback() {
  const queueRef = React.useRef<string[]>([]);
  const playerRef = React.useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const isPlayingRef = React.useRef(false);
  const [isPlaying, setIsPlaying] = React.useState(false);

  // `playNext` calls itself once the current chunk finishes — routed through a
  // ref rather than referencing `playNext` directly, since a `useCallback`
  // can't safely close over its own not-yet-initialized binding.
  const playNextRef = React.useRef<() => void>(() => {});

  const playNext = React.useCallback(() => {
    const next = queueRef.current.shift();
    if (next === undefined) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }
    isPlayingRef.current = true;
    setIsPlaying(true);
    const player = createAudioPlayer(toDataUri(next));
    playerRef.current = player;
    const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!status.didJustFinish)
        return;
      subscription.remove();
      player.remove();
      if (playerRef.current === player)
        playerRef.current = null;
      playNextRef.current();
    });
    player.play();
  }, []);
  playNextRef.current = playNext;

  const enqueue = React.useCallback((audioBase64: string) => {
    queueRef.current.push(audioBase64);
    if (!isPlayingRef.current)
      playNext();
  }, [playNext]);

  /** Barge-in (PRD §7.10: "interruption must stop playback"): stops whatever's playing right now and drops anything queued behind it. */
  const stopAndClear = React.useCallback(() => {
    queueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current.remove();
      playerRef.current = null;
    }
  }, []);

  React.useEffect(() => stopAndClear, [stopAndClear]);

  return { enqueue, stopAndClear, isPlaying };
}
