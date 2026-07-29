import { useRouter } from 'expo-router';
import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Input } from '@/components/ui';

/**
 * Dev-only screen for ticket #20's UAT: proves the Debrief screen renders
 * real, ranked `debrief_items` end to end, without needing a live
 * Converse session (the pipeline that would produce one is blocked on
 * ticket #18). Not part of the shipping product; no route links to it.
 * Reachable directly at `/debrief-debug`, matching the
 * `app-service-debug`/`voice-service-debug` precedent.
 *
 * "Seed & view" creates a real learner and session via app-service, posts
 * a fixed set of sample observations (mirroring the Wave 1 fixture's
 * patterns so the before/after is easy to compare), then navigates to
 * `/debrief?sessionId=...` — the real screen, rendering real
 * `debrief_items` fetched from Postgres.
 */
export function DebriefDebugScreen() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = React.useState('http://localhost:8081');
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const handleSeedAndView = React.useCallback(async () => {
    setBusy(true);
    setStatus('creating learner…');
    try {
      const learnerResponse = await fetch(`${baseUrl}/learners`, { method: 'POST' });
      const learner = await learnerResponse.json();
      if (!learnerResponse.ok)
        throw new Error(`POST /learners failed: ${learnerResponse.status}`);

      setStatus('creating session…');
      const sessionResponse = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ learnerId: learner.id }),
      });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok)
        throw new Error(`POST /sessions failed: ${sessionResponse.status}`);

      setStatus('writing observations…');
      const observationsResponse = await fetch(`${baseUrl}/sessions/${session.id}/observations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          learnerId: learner.id,
          observations: [
            {
              kind: 'grammar_error',
              structureKey: 'aspect_perfective',
              impeded: true,
              detail: { title: 'Мы иска́ли, not мы и́щем.', body: 'Past narration came up four times. Twice she had to ask what you meant.', tag: 'impeded communication · 2×' },
            },
            {
              kind: 'grammar_error',
              structureKey: 'case_government',
              impeded: false,
              detail: { title: 'в гараже́, not в гара́ж.', body: 'Location after в takes the prepositional. Only after motion verbs does it take the accusative.' },
            },
            {
              kind: 'stress_error',
              structureKey: 'stress_placement',
              impeded: false,
              detail: { title: 'Stress: нашла́сь, not на́шлась.', body: 'Recurring across three turns. She worked it out from context each time.' },
            },
          ],
        }),
      });
      if (!observationsResponse.ok)
        throw new Error(`POST /observations failed: ${observationsResponse.status}`);

      setStatus(`done — opening /debrief?sessionId=${session.id}`);
      router.push({ pathname: '/debrief', params: { sessionId: session.id } });
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
      <Text className="mb-4 text-lg font-bold">Debrief — ticket #20 debug</Text>

      <Input label="app-service base URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" />

      <View className="mt-2 mb-4">
        <Button label="Seed session & view debrief" onPress={handleSeedAndView} disabled={busy} size="sm" />
      </View>

      <Text className="text-xs text-neutral-500">{status}</Text>
    </ScrollView>
  );
}
