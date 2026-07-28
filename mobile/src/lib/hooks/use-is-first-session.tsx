import { useMMKVBoolean } from 'react-native-mmkv';

import { storage } from '../storage';

const IS_FIRST_SESSION = 'IS_FIRST_SESSION';

/**
 * Whether the learner has ever started a conversation session — distinct
 * from `useIsFirstTime` (onboarding completion). Gates the Open screen's
 * "She'll hear you the whole time. Just talk." copy, per the mockup README:
 * "First session only (PRD §6.2)".
 */
export function useIsFirstSession() {
  const [isFirstSession, setIsFirstSession] = useMMKVBoolean(IS_FIRST_SESSION, storage);
  if (isFirstSession === undefined) {
    return [true, setIsFirstSession] as const;
  }
  return [isFirstSession, setIsFirstSession] as const;
}
