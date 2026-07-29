import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Input } from '@/components/ui';
import { VoiceConnection } from '@/lib/voice-service/voice-connection';

/**
 * Dev-only screen for ticket #11's UAT: proving an authenticated
 * round-trip ping works end to end from a real device, without ever
 * baking a token into the shipped bundle. URL and token are typed in by
 * hand — see `voice-connection.ts` for why there's no default/bundled
 * value here. Not part of the shipping product; no route links to it.
 * Reachable directly at `/voice-service-debug`.
 */
export function VoiceServiceDebugScreen() {
  const [url, setUrl] = React.useState('ws://localhost:8080');
  const [token, setToken] = React.useState('');
  const [state, setState] = React.useState<'connecting' | 'open' | 'closed'>('closed');
  const [log, setLog] = React.useState<string[]>([]);
  const connectionRef = React.useRef<VoiceConnection | null>(null);

  const appendLog = React.useCallback((line: string) => {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  const handleConnect = React.useCallback(() => {
    connectionRef.current?.disconnect();
    const connection = new VoiceConnection({
      url,
      token,
      onStateChange: (nextState) => {
        setState(nextState);
        appendLog(`state → ${nextState}`);
      },
    });
    connectionRef.current = connection;
    connection.connect();
  }, [url, token, appendLog]);

  const handleDisconnect = React.useCallback(() => {
    connectionRef.current?.disconnect();
  }, []);

  const handlePing = React.useCallback(() => {
    connectionRef.current
      ?.ping()
      .then(pong => appendLog(`pong ← serverTime=${pong.serverTime}`))
      .catch((error: Error) => appendLog(`ping failed: ${error.message}`));
  }, [appendLog]);

  React.useEffect(() => () => connectionRef.current?.disconnect(), []);

  return (
    <ScrollView className="flex-1 bg-white px-6 pt-16">
      <Text className="mb-4 text-lg font-bold">Voice service — ticket #11 debug</Text>

      <Input label="Voice service URL" value={url} onChangeText={setUrl} autoCapitalize="none" />
      <Input label="Bearer token" value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry />

      <Text className="mb-4">
        state:
        {' '}
        {state}
      </Text>

      <View className="mb-4 flex-row gap-3">
        <Button label="Connect" onPress={handleConnect} size="sm" />
        <Button label="Ping" onPress={handlePing} size="sm" disabled={state !== 'open'} />
        <Button label="Disconnect" onPress={handleDisconnect} size="sm" variant="outline" />
      </View>

      {log.map((line, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Text key={index} className="text-xs text-neutral-500">
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}
