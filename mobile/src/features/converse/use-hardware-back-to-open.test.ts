import { renderHook } from '@testing-library/react-native';

import { BackHandler } from 'react-native';

/** No expo-router mock infrastructure exists elsewhere in this repo (screen-level `.tsx` files generally aren't tested at all — see e.g. converse-screen.tsx, which has no test file); this hook is small and self-contained enough that a minimal inline mock is cheaper than standing up shared infrastructure for one call site. */
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// eslint-disable-next-line import/first -- must follow jest.mock('expo-router', ...) above
import { useHardwareBackToOpen } from './use-hardware-back-to-open';

function latestBackHandler(): () => boolean | null | undefined {
  const calls = (BackHandler.addEventListener as jest.Mock).mock.calls as [string, () => boolean | null | undefined][];
  const handler = calls.filter(([event]) => event === 'hardwareBackPress').at(-1)?.[1];
  if (!handler)
    throw new Error('hardwareBackPress was never registered');
  return handler;
}

let removeSpy: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  removeSpy = jest.fn();
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: removeSpy });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useHardwareBackToOpen', () => {
  it('replaces to /open with learnerId when the hardware back button is pressed, and reports the press as handled', () => {
    renderHook(() => useHardwareBackToOpen('learner-1'));

    const handled = latestBackHandler()();

    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/open', params: { learnerId: 'learner-1' } });
    expect(handled).toBe(true);
  });

  it('replaces to the bare /open path when there is no learnerId (scripted demo, no real learner)', () => {
    renderHook(() => useHardwareBackToOpen(undefined));

    latestBackHandler()();

    expect(mockReplace).toHaveBeenCalledWith('/open');
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useHardwareBackToOpen('learner-1'));
    expect(removeSpy).not.toHaveBeenCalled();

    unmount();

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
