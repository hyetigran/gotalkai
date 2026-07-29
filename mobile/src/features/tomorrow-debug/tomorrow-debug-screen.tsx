import { useRouter } from 'expo-router';
import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Input } from '@/components/ui';

/**
 * Dev-only screen for ticket #21's UAT: proves the Tomorrow screen
 * renders a real, server-selected scenario end to end, without needing a
 * live Converse session (blocked on ticket #18). Not part of the
 * shipping product; no route links to it. Reachable directly at
 * `/tomorrow-debug`, matching the `debrief-debug` precedent (ticket #20).
 *
 * "Create session & view" creates a real learner and session via
 * app-service — `POST /sessions` runs real scenario selection against
 * that (brand-new) learner's `learner_structures`/session history — then
 * navigates to `/tomorrow?sessionId=...`, the real screen, rendering the
 * real selected scenario. The escalate/de-escalate behavior itself
 * (ticket #21's core UAT) is proven by scenario-selector.test.ts against
 * real Postgres, not by this screen — this screen only proves the
 * client-side render path.
 */
export function TomorrowDebugScreen() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = React.useState('http://localhost:8081');
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const handleCreateAndView = React.useCallback(async () => {
    setBusy(true);
    setStatus('creating learner…');
    try {
      const learnerResponse = await fetch(`${baseUrl}/learners`, { method: 'POST' });
      const learner = await learnerResponse.json();
      if (!learnerResponse.ok)
        throw new Error(`POST /learners failed: ${learnerResponse.status}`);

      setStatus('creating session (runs real scenario selection)…');
      const sessionResponse = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ learnerId: learner.id }),
      });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok)
        throw new Error(`POST /sessions failed: ${sessionResponse.status}`);

      setStatus(`done — opening /tomorrow?sessionId=${session.id}`);
      router.push({ pathname: '/tomorrow', params: { sessionId: session.id } });
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
      <Text className="mb-4 text-lg font-bold">Tomorrow — ticket #21 debug</Text>

      <Input label="app-service base URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" />

      <View className="mt-2 mb-4">
        <Button label="Create session & view tomorrow" onPress={handleCreateAndView} disabled={busy} size="sm" />
      </View>

      <Text className="text-xs text-neutral-500">{status}</Text>
    </ScrollView>
  );
}
