import { inspect } from 'node:util';

import { wrapPersonaMemoryContent } from './persona-memories';

describe('RedactedMemoryContent', () => {
  const secret = 'her cat Marfa was sick last week';

  it('redacts on toString', () => {
    const wrapped = wrapPersonaMemoryContent(secret);
    expect(String(wrapped)).toBe('[REDACTED:persona_memory]');
    expect(String(wrapped)).not.toContain(secret);
  });

  it('redacts on JSON.stringify', () => {
    const wrapped = wrapPersonaMemoryContent(secret);
    expect(JSON.stringify(wrapped)).toBe('"[REDACTED:persona_memory]"');
  });

  it('redacts on console.log-style formatting (util.inspect)', () => {
    const wrapped = wrapPersonaMemoryContent(secret);
    expect(inspect(wrapped)).toBe('[REDACTED:persona_memory]');
    expect(inspect({ content: wrapped })).not.toContain(secret);
  });

  it('reveals the real value only via the explicit reveal() call', () => {
    const wrapped = wrapPersonaMemoryContent(secret);
    expect(wrapped.reveal()).toBe(secret);
  });
});
