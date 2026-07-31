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
    const file = writeChunkToTempFile(next);
    currentFileRef.current = file;
    const player = createAudioPlayer(file.uri);
    playerRef.current = player;
    const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!status.didJustFinish)
        return;
      subscription.remove();
      player.remove();
      if (playerRef.current === player)
        playerRef.current = null;
      cleanUpCurrentFile();
      playNextRef.current();
    });
    player.play();
  }, [cleanUpCurrentFile]);
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
    cleanUpCurrentFile();
  }, [cleanUpCurrentFile]);

  React.useEffect(() => stopAndClear, [stopAndClear]);

  return { enqueue, stopAndClear, isPlaying };
}
