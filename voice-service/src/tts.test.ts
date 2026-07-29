import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { toElevenLabsPhonemeTag } from './stress/phoneme-format';
import { synthesizeSpeech } from './tts';

type ConvertCall = { voiceId: string; text: string; modelId?: string };
type ConvertResponse = { audioBase64: string; alignment?: unknown } | { throw: Error };

function fakeClient(responsesBySentence: Record<string, ConvertResponse>): { client: ElevenLabsClient; calls: ConvertCall[] } {
  const calls: ConvertCall[] = [];
  const client = {
    textToSpeech: {
      convertWithTimestamps: async (voiceId: string, request: { text: string; modelId?: string }) => {
        calls.push({ voiceId, text: request.text, modelId: request.modelId });
        const response = responsesBySentence[request.text];
        if (!response)
          throw new Error(`no fake response configured for sentence: ${request.text}`);
        if ('throw' in response)
          throw response.throw;
        return response;
      },
    },
  } as unknown as ElevenLabsClient;
  return { client, calls };
}

describe('synthesizeSpeech', () => {
  it('calls the TTS vendor once per sentence, in order, with the eleven_v3 model (required for IPA phoneme tags, docs/adr/0013)', async () => {
    const { client, calls } = fakeClient({
      'Здравствуй!': { audioBase64: 'AAA' },
      'Заходи.': { audioBase64: 'BBB' },
    });
    const chunks = await synthesizeSpeech(client, 'voice-123', 'Здравствуй! Заходи.');
    expect(calls).toEqual([
      { voiceId: 'voice-123', text: 'Здравствуй!', modelId: 'eleven_v3' },
      { voiceId: 'voice-123', text: 'Заходи.', modelId: 'eleven_v3' },
    ]);
    expect(chunks.map(chunk => chunk.audioBase64)).toEqual(['AAA', 'BBB']);
  });

  it('captures character-alignment data per chunk when the vendor returns it (AC #3)', async () => {
    const alignment = { characters: ['п', 'р'], characterStartTimesSeconds: [0, 0.1], characterEndTimesSeconds: [0.1, 0.2] };
    const { client } = fakeClient({ Привет: { audioBase64: 'AAA', alignment } });
    const chunks = await synthesizeSpeech(client, 'voice-123', 'Привет');
    expect(chunks[0]?.alignment).toEqual(alignment);
  });

  it('invokes onChunk as soon as each sentence is ready, before later sentences are synthesized — the actual "streamed, not awaited as one block" behavior AC #1 asks for', async () => {
    const { client } = fakeClient({
      'Раз.': { audioBase64: 'AAA' },
      'Два.': { audioBase64: 'BBB' },
    });
    const seenAtCallTime: number[] = [];
    const onChunk = jest.fn((_chunk, index: number) => {
      seenAtCallTime.push(index);
    });
    await synthesizeSpeech(client, 'voice-123', 'Раз. Два.', { onChunk });
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(seenAtCallTime).toEqual([0, 1]); // fired in sentence order, not batched at the end
  });

  it('returns an empty array for empty input without calling the vendor at all', async () => {
    const { client, calls } = fakeClient({});
    const chunks = await synthesizeSpeech(client, 'voice-123', '');
    expect(chunks).toEqual([]);
    expect(calls).toEqual([]);
  });

  it(
    'reports a vendor failure via onError and continues with the remaining sentences, rather than throwing and discarding already-synthesized chunks',
    async () => {
      const { client } = fakeClient({
        'Раз.': { audioBase64: 'AAA' },
        'Два.': { throw: new Error('vendor unavailable') },
        'Три.': { audioBase64: 'CCC' },
      });
      const onError = jest.fn();
      const chunks = await synthesizeSpeech(client, 'voice-123', 'Раз. Два. Три.', { onError });

      expect(chunks.map(chunk => chunk.audioBase64)).toEqual(['AAA', 'CCC']); // sentence 2 skipped, 1 and 3 still delivered
      expect(onError).toHaveBeenCalledWith(new Error('vendor unavailable'), 1);
    },
  );

  it('reports a malformed vendor response via onError (missing required audioBase64) rather than crashing or fabricating a chunk', async () => {
    const { client } = fakeClient({
      Привет: { alignment: undefined } as unknown as ConvertResponse, // no audioBase64 at all
    });
    const onError = jest.fn();
    const chunks = await synthesizeSpeech(client, 'voice-123', 'Привет', { onError });

    expect(chunks).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 0);
  });

  it(
    'synthesizes phoneme-tagged text end to end — proving stress-annotation.ts\'s output (via phoneme-format.ts) actually reaches the vendor as the SSML this whole pipeline exists to send, not just in a comment\'s claim',
    async () => {
      const tag = toElevenLabsPhonemeTag('говорить', `говори${'́'}ть`); // <phoneme alphabet="ipa" ph="ɡovorˈitʲ">говорить</phoneme>
      const sentence = `${tag}.`; // splitIntoSentences keeps the trailing terminator as part of the sentence
      const { client, calls } = fakeClient({ [sentence]: { audioBase64: 'AAA' } });

      const chunks = await synthesizeSpeech(client, 'voice-123', sentence);

      expect(calls[0]?.text).toContain('<phoneme');
      expect(calls[0]?.text).toContain('ph="ɡovorˈitʲ"');
      expect(chunks).toHaveLength(1);
    },
  );
});

/**
 * End-to-end against the real ElevenLabs API — gated behind both a real
 * `ELEVENLABS_API_KEY` and a real `ELEVENLABS_VALENTINA_VOICE_ID`.
 * Neither exists in this background-job environment (no ElevenLabs
 * account, and no voice has been picked from their library — see
 * docs/adr/0016), so this is skipped here and will run for real the
 * first time this suite executes somewhere with both configured.
 */
const describeIfLiveApi = process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VALENTINA_VOICE_ID ? describe : describe.skip;

describeIfLiveApi('synthesizeSpeech (live API)', () => {
  it('produces real audio and character-alignment data for a short Russian sentence', async () => {
    const { ElevenLabsClient } = await import('@elevenlabs/elevenlabs-js');
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
    const chunks = await synthesizeSpeech(client, process.env.ELEVENLABS_VALENTINA_VOICE_ID as string, 'Здравствуй!');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.audioBase64.length).toBeGreaterThan(0);
    expect(chunks[0]?.alignment?.characters.length).toBeGreaterThan(0);
  });
});
