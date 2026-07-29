import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Input } from '@/components/ui';

/**
 * Dev-only screen for ticket #12's UAT: "From the app on a physical
 * device, trigger the minimal API call." Not part of the shipping
 * product; no route links to it. Reachable directly at
 * `/app-service-debug`, matching the `voice-service-debug` precedent.
 *
 * `/health` has no auth requirement (unlike the voice service's stream —
 * ticket #12's acceptance criteria don't ask for one on this endpoint),
 * so unlike the voice-service debug screen there's no token to keep out
 * of the bundle here — just a URL to call.
 */
export function AppServiceDebugScreen() {
  const [url, setUrl] = React.useState('http://localhost:8081/health');
  const [result, setResult] = React.useState<string>('');

  const handleCheck = React.useCallback(() => {
    setResult('checking…');
    fetch(url)
      .then(async (response) => {
        const body = await response.text();
        setResult(`${response.status}\n${body}`);
      })
      .catch((error: Error) => setResult(`request failed: ${error.message}`));
  }, [url]);

  return (
    <ScrollView className="flex-1 bg-white px-6 pt-16">
      <Text className="mb-4 text-lg font-bold">App service — ticket #12 debug</Text>

      <Input label="App service /health URL" value={url} onChangeText={setUrl} autoCapitalize="none" />

      <View className="mb-4">
        <Button label="Check" onPress={handleCheck} size="sm" />
      </View>

      <Text className="text-xs text-neutral-500">{result}</Text>
    </ScrollView>
  );
}
