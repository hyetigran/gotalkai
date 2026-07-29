import { useRouter } from 'expo-router';
import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Input } from '@/components/ui';

/**
 * Dev-only screen for ticket #24's UAT: proves the daily session cap is
 * enforced server-side and that hitting it routes to the real "come back
 * tomorrow" UX (the Open screen's Answer button, `use-open-screen.ts`),
 * not a client-side nag. Not part of the shipping product; no route
 * links to it. Reachable directly at `/session-cap-debug`, matching the
 * `open-debug`/`debrief-debug`/`tomorrow-debug` precedent.
 *
 * "Create learner & fill the cap" creates a real learner, then calls
 * `POST /sessions` repeatedly against app-service — the exact endpoint
 * the real Open screen calls — until the server itself returns
 * 429/`daily_cap_reached` (proving the cap can't be bypassed by calling
 * the API directly, not just by hiding a button), then navigates to
 * `/open?learnerId=...` so pressing Answer there demonstrates the real
 * redirect-to-Tomorrow UX live.
 */
export function SessionCapDebugScreen() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = React.useState('http://localhost:8081');
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const handleFillCapAndView = React.useCallback(async () => {
    setBusy(true);
    setStatus('creating learner…');
    try {
      const learnerResponse = await fetch(`${baseUrl}/learners`, { method: 'POST' });
      const learner = await learnerResponse.json();
      if (!learnerResponse.ok)
        throw new Error(`POST /learners failed: ${learnerResponse.status}`);

      let attempts = 0;
      let lastStatus = 0;
      // A real, unmodified client loop — no shortcut around the server's
      // own check. Bounded so a misconfigured cap can't loop forever; 20
      // is arbitrary but generous — no realistic DAILY_SESSION_CAP value
      // is expected to exceed single digits (PRD §9's own math argues
      // for 1), so hitting this bound at all signals something's wrong
      // with the configured cap, not that we need to try harder.
      while (lastStatus !== 429 && attempts < 20) {
        attempts += 1;
        setStatus(`calling POST /sessions (attempt ${attempts})…`);
        const sessionResponse = await fetch(`${baseUrl}/sessions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ learnerId: learner.id }),
        });
        lastStatus = sessionResponse.status;
      }

      if (lastStatus !== 429)
        throw new Error(`cap was not reached after ${attempts} attempts — check DAILY_SESSION_CAP`);

      setStatus(`cap reached after ${attempts} attempts (429, real server rejection) — opening /open?learnerId=${learner.id}`);
      router.push({ pathname: '/open', params: { learnerId: learner.id } });
    }
    catch (error) {
      setStatus(`failed: ${(error as Error).message}`);
    }
    finally {
      setBusy(false);
    }
  }, [baseUrl, router]);

  return (
    <ScrollView className="flex-1 bg-white px-6 pt-16">
      <Text className="mb-4 text-lg font-bold">Session cap — ticket #24 debug</Text>

      <Input label="app-service base URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" />

      <View className="mt-2 mb-4">
        <Button label="Create learner, fill the cap, & view Open" onPress={handleFillCapAndView} disabled={busy} size="sm" />
      </View>

      <Text className="text-xs text-neutral-500">{status}</Text>
    </ScrollView>
  );
}
