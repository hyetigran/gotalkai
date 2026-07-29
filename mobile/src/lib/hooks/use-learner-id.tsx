import { useMMKVString } from 'react-native-mmkv';

import { storage } from '../storage';

const LEARNER_ID = 'LEARNER_ID';

/**
 * The real learner id created during onboarding (ticket #30) — distinct
 * from the Obytes scaffold's `IS_FIRST_TIME`/`onboarding-screen.tsx`,
 * which are unrelated unused boilerplate, not this product's real
 * onboarding. Once set, every screen that accepts a `learnerId` route
 * param (Open, Converse — tickets #22/#24/#30) can be driven with real
 * data instead of falling back to scripted content.
 */
export function useLearnerId() {
  return useMMKVString(LEARNER_ID, storage);
}
