import type { AudioStatus } from 'expo-audio';
import { createAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as React from 'react';

import { base64ToBytes } from './base64-decode';

/**
 * Sequential MP3 playback for ticket #18's `tts_chunk` stream.
 *
 * Originally played each chunk via a `data:audio/mpeg;base64,...` URI
 * directly (`expo-audio`'s `AudioSource` accepts a plain string, so no
 * file write looked necessary). Confirmed on a physical device
 * (docs/adr/0024's on-device pass) that this doesn't work: expo-audio's
 * Android `createMediaItem` (AudioModule.kt) only special-cases
 * `http`/`https` schemes — everything else, including `data:`, falls
 * through to `DefaultDataSource.Factory`, which has no `data:`-scheme
 * handler at all. ExoPlayer's resulting load failure never reaches JS:
 * expo-audio's `Player.Listener` (AudioPlayer.kt) doesn't override
 * `onPlayerError`, so the failure is silent — `didJustFinish` never
 * fires, nothing errors, there's just no sound. This is exactly the
 * fallback docs/adr/0017 already anticipated: write each chunk to a real
 * temp file and play it via `file://` instead (`FileDataSource`, which
 * `DefaultDataSource` does handle).
 *
 * Chunks are decoded to raw bytes and written via `file.write(bytes)` —
 * not `file.write(base64String, { encoding: 'base64' })` — because
 * `FileSystemFile.kt`'s `write(content: String)` overload (checked
 * against expo-file-system's own Android source, not assumed from the
 * TS types) writes the string's raw UTF-8 bytes and ignores the
 * `encoding` option entirely; only the `ByteArray`/`Uint8Array` overload
 * writes real decoded bytes.
 *
 * `tts_chunk` messages are guaranteed to arrive in sentence order on a
 * single WebSocket connection (voice-service's synthesizeSpeech emits
 * them synchronously in order within one turn — see tts.ts/ticket #17) —
 * this plays them in receipt order, not by sorting on `sentenceIndex`.
 */

const TTS_CHUNK_DIR_NAME = 'tts-chunks';

function ttsChunkDirectory(): Directory {
  const directory = new Directory(Paths.cache, TTS_CHUNK_DIR_NAME);
  if (!directory.exists)
    directory.create({ intermediates: true });
  return directory;
}

/** A unique filename per chunk — several chunks can exist on disk at once (one playing, more queued behind it) within a single turn. */
function writeChunkToTempFile(audioBase64: string): File {
  const file = new File(ttsChunkDirectory(), `${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  file.write(base64ToBytes(audioBase64));
  return file;
}

/** Best-effort delete — a lingering temp file in the cache directory (which the OS can reclaim under storage pressure anyway) is not worth surfacing as an error. */
function deleteQuietly(file: File): void {
  try {
    if (file.exists)
      file.delete();
  }
  catch {
    // See this function's own comment.
  }
}

/**
 * UAT: "after a 3 minute session, the persona's voice disappeared. The
 * frequency still was active and the text appeared but no sound." Real
 * device logs pinned the cause exactly: `ExoPlayerImplInternal: Playback
 * error ... AudioSink$InitializationException: AudioTrack init failed ...
 * Cannot create AudioTrack` — the native `AudioTrack` pool exhausted
 * after enough create/destroy cycles (one player per TTS chunk, several
 * chunks per turn, several turns over a few minutes).
 *
 * `expo-audio`'s `AudioStatus`/`AudioEvents` types (checked directly
 * against node_modules, not assumed) expose no error field or error
 * event at all — a native playback failure like this never reaches JS
 * in any form. Without this watchdog, `didJustFinish` simply never
 * fires for the failed chunk, `playNext` never gets called again, and
 * the queue — along with every later turn's audio — hangs forever. The
 * watchdog can't fix *why* AudioTrack creation eventually fails (an
 * Android/expo-audio resource-churn characteristic outside this file's
 * control), only make a single failed chunk a recoverable hiccup instead
 * of a session-ending one.
 */
const PLAYBACK_WATCHDOG_MS = 15_000;

/**
 * Creates the player for one chunk and wires its completion path —
 * pulled out of `useTtsPlayback`/`playNext` purely to stay under this
 * repo's max-lines-per-function budget, same reasoning
 * `use-native-pcm-capture.ts`'s own extracted helpers already document,
 * not a meaningfully separate concern on its own.
 */
function startPlayingChunk(params: {
  audioBase64: string;
  playerRef: React.RefObject<ReturnType<typeof createAudioPlayer> | null>;
  currentFileRef: React.RefObject<File | null>;
  watchdogIdRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  cleanUpCurrentFile: () => void;
  playNextRef: React.RefObject<() => void>;
}): void {
  const { audioBase64, playerRef, currentFileRef, watchdogIdRef, cleanUpCurrentFile, playNextRef } = params;
  const file = writeChunkToTempFile(audioBase64);
  currentFileRef.current = file;
  const player = createAudioPlayer(file.uri);
  playerRef.current = player;

  // See PLAYBACK_WATCHDOG_MS's own comment — `settled` guards against
  // both the real `didJustFinish` and the watchdog firing for the same
  // chunk (whichever happens first wins; the other becomes a no-op).
  let settled = false;
  const advance = () => {
    if (settled)
      return;
    settled = true;
    if (watchdogIdRef.current) {
      clearTimeout(watchdogIdRef.current);
      watchdogIdRef.current = null;
    }
    subscription.remove();
    try {
      player.remove();
    }
    catch {
      // A player whose native AudioTrack never finished initializing
      // (this function's own UAT comment) may not have a real resource
      // to release — nothing actionable to do with that.
    }
    if (playerRef.current === player)
      playerRef.current = null;
    cleanUpCurrentFile();
    playNextRef.current();
  };

  watchdogIdRef.current = setTimeout(advance, PLAYBACK_WATCHDOG_MS);
  const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    if (status.didJustFinish)
      advance();
  });
  player.play();
}

export function useTtsPlayback() {
  const queueRef = React.useRef<string[]>([]);
  const playerRef = React.useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const currentFileRef = React.useRef<File | null>(null);
  const isPlayingRef = React.useRef(false);
  const [isPlaying, setIsPlaying] = React.useState(false);

  // `playNext` calls itself once the current chunk finishes — routed through a
  // ref rather than referencing `playNext` directly, since a `useCallback`
  // can't safely close over its own not-yet-initialized binding.
  const playNextRef = React.useRef<() => void>(() => {});
  // Shared with `stopAndClear` below — a barge-in mid-chunk removes the
  // player directly, but without also cancelling *this* chunk's pending
  // watchdog timer, it would still fire ~15s later: `settled` is scoped
  // to that one `playNext` call's own closure, invisible to
  // `stopAndClear`, so the stale `advance()` would run anyway and call
  // `cleanUpCurrentFile()`/`playNextRef.current()` against whatever
  // *newer* chunk happens to be current by then.
  const watchdogIdRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanUpCurrentFile = React.useCallback(() => {
    const file = currentFileRef.current;
    currentFileRef.current = null;
    if (file)
      deleteQuietly(file);
  }, []);

  const playNext = React.useCallback(() => {
    const next = queueRef.current.shift();
    if (next === undefined) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }
    isPlayingRef.current = true;
    setIsPlaying(true);
    startPlayingChunk({ audioBase64: next, playerRef, currentFileRef, watchdogIdRef, cleanUpCurrentFile, playNextRef });
  }, [cleanUpCurrentFile]);
  playNextRef.current = playNext;

  const enqueue = React.useCallback((audioBase64: string) => {
    queueRef.current.push(audioBase64);
    if (!isPlayingRef.current)
      playNext();
  }, [playNext]);

  /**
   * Barge-in (PRD §7.10: "interruption must stop playback"): stops
   * whatever's playing right now and drops anything queued behind it.
   * Also cancels the current chunk's watchdog timer (see
   * `watchdogIdRef`'s own comment) — without this, a barge-in mid-chunk
   * would still let that timer fire ~15s later and tear down whatever
   * new chunk is playing by then.
   */
  const stopAndClear = React.useCallback(() => {
    queueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (watchdogIdRef.current) {
      clearTimeout(watchdogIdRef.current);
      watchdogIdRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current.remove();
      playerRef.current = null;
    }
    cleanUpCurrentFile();
  }, [cleanUpCurrentFile]);

  React.useEffect(() => stopAndClear, [stopAndClear]);

  return { enqueue, stopAndClear, isPlaying };
}
