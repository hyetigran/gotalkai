import { parseUuidParam } from './id-params';

describe('parseUuidParam', () => {
  it('accepts a well-formed UUID', () => {
    expect(parseUuidParam('00000000-0000-0000-0000-000000000000')).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('rejects a malformed id', () => {
    expect(parseUuidParam('not-a-uuid')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseUuidParam('')).toBeNull();
  });

  it('rejects a numeric id', () => {
    expect(parseUuidParam('12345')).toBeNull();
  });
});
