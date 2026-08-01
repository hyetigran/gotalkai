import { B1_READY_STRUCTURE_COUNT, computeAddressBookEntryStatus, isB1Ready } from './address-book-math';

describe('isB1Ready', () => {
  it('is false below the threshold', () => {
    expect(isB1Ready(B1_READY_STRUCTURE_COUNT - 1)).toBe(false);
  });

  it('is true at or above the threshold', () => {
    expect(isB1Ready(B1_READY_STRUCTURE_COUNT)).toBe(true);
    expect(isB1Ready(B1_READY_STRUCTURE_COUNT + 5)).toBe(true);
  });

  it('is false at zero — a learner with no tracked structures at all', () => {
    expect(isB1Ready(0)).toBe(false);
  });
});

describe('computeAddressBookEntryStatus', () => {
  it('Валентина is always reached, regardless of mastered-structure count', () => {
    expect(computeAddressBookEntryStatus('valentina', 0)).toBe('reached');
    expect(computeAddressBookEntryStatus('valentina', 100)).toBe('reached');
  });

  it('Елена is next when not yet B1-ready', () => {
    expect(computeAddressBookEntryStatus('elena', 0)).toBe('next');
    expect(computeAddressBookEntryStatus('elena', B1_READY_STRUCTURE_COUNT - 1)).toBe('next');
  });

  it('Елена is reached once B1-ready', () => {
    expect(computeAddressBookEntryStatus('elena', B1_READY_STRUCTURE_COUNT)).toBe('reached');
  });
});
