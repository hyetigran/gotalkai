import { useRouter } from 'expo-router';
import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Input } from '@/components/ui';

/**
 * Dev-only screen for ticket #22's UAT: proves the Open screen renders a
 * real, seeded/rotating `persona_memories` callback line end to end,
 * without needing a live Converse session (blocked on ticket #18). Not
 * part of the shipping product; no route links to it. Reachable directly
 * at `/open-debug`, matching the `debrief-debug`/`tomorrow-debug`
 * precedent (tickets #20/#21).
 *
 * "Create learner & view" creates a real learner via app-service —
 * `POST /learners` seeds 1–2 starter memories (ticket #22 AC #3) — then
 * navigates to `/open?learnerId=...`, the real screen, rendering a real
 * callback line. "Add a memory" posts an extra memory for that same
 * learner via `POST /learners/:id/memories`, so the rotation
 * (least-recently-referenced first) is directly observable across
 * repeated visits to `/open`.
 */
export function OpenDebugScreen() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = React.useState('http://localhost:8081');
  const [learnerId, setLearnerId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const handleCreateAndView = React.useCallback(async () => {
    setBusy(true);
    setStatus('creating learner (seeds starter memories)…');
    try {
      const response = await fetch(`${baseUrl}/learners`, { method: 'POST' });
      const learner = await response.json();
      if (!response.ok)
        throw new Error(`POST /learners failed: ${response.status}`);
      setLearnerId(learner.id);
      setStatus(`done — opening /open?learnerId=${learner.id}`);
      router.push({ pathname: '/open', params: { learnerId: learner.id } });
    }
    catch (error) {
      setStatus(`failed: ${(error as Error).message}`);
    }
    finally {
      setBusy(false);
    }
  }, [baseUrl, router]);

  const handleAddMemoryAndView = React.useCallback(async () => {
    if (!learnerId) {
      setStatus('create a learner first');
      return;
    }
    setBusy(true);
    setStatus('writing a new memory…');
    try {
      const memoryResponse = await fetch(`${baseUrl}/learners/${learnerId}/memories`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: `Она вспомнила разговор от ${new Date().toLocaleString()}.` }),
      });
      if (!memoryResponse.ok)
        throw new Error(`POST /memories failed: ${memoryResponse.status}`);

      setStatus(`done — opening /open?learnerId=${learnerId}`);
      router.push({ pathname: '/open', params: { learnerId } });
    }
    catch (error) {
      setStatus(`failed: ${(error as Error).message}`);
    }
    finally {
      setBusy(false);
    }
  }, [baseUrl, learnerId, router]);

  return (
    <ScrollView className="flex-1 bg-white px-6 pt-16">
      <Text className="mb-4 text-lg font-bold">Open — ticket #22 debug</Text>

      <Input label="app-service base URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" />

      <View className="mt-2 mb-4">
        <Button label="Create learner & view (session one)" onPress={handleCreateAndView} disabled={busy} size="sm" />
      </View>

      <Input label="Learner id (filled after creating one)" value={learnerId} onChangeText={setLearnerId} autoCapitalize="none" />

      <View className="mt-2 mb-4">
        <Button label="Add a memory & view (rotation)" onPress={handleAddMemoryAndView} disabled={busy || !learnerId} size="sm" />
      </View>

      <Text className="text-xs text-neutral-500">{status}</Text>
    </ScrollView>
  );
}
