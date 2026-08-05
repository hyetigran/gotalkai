import type { EntryStatus } from './address-book-fixture';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tabBarClearance } from '@/components/ui/design-tokens';
import { CAST_FIXTURE, ADDRESS_BOOK_COPY as copy, REACHED_COUNT } from './address-book-fixture';
import { AddressBookEntry } from './components/address-book-entry';

function statusFor(index: number): EntryStatus {
  if (index < REACHED_COUNT)
    return 'reached';
  if (index === REACHED_COUNT)
    return 'next';
  return 'sealed';
}

/**
 * The Address book screen — fixture data only. Layout and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("5. Address book"). Deliberately not a chart or coverage map: this is
 * the only progression surface in the product (PRD §6.4).
 */
export function AddressBookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // A set, not a single `number | null` — expanding one entry used to
  // collapse whichever other one was open, so both animated at once and
  // the list visibly jumped. Each entry now expands/collapses on its own.
  const [expandedIndices, setExpandedIndices] = React.useState<ReadonlySet<number>>(() => new Set([REACHED_COUNT - 1]));

  const toggleExpanded = React.useCallback((index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index))
        next.delete(index);
      else
        next.add(index);
      return next;
    });
  }, []);

  return (
    <View
      className="flex-1 bg-page px-[22px] pt-[60px]"
      style={{ paddingBottom: insets.bottom + tabBarClearance }}
    >
      {/* UAT: tabs restructuring — this is now the Home tab's root screen (src/app/(tabs)/_layout.tsx), reached by switching tabs, not pushed onto a stack, so there's no "back" screen for router.back() to return to any more. */}
      <View className="items-center">
        <Text className="font-sans-semibold text-[13px] text-ink/60">{copy.castHead}</Text>
      </View>

      <View className="mt-[16px]">
        <Text className="font-sans-semibold text-[22px] text-ink">{copy.bookHead}</Text>
        <Text className="font-mono-medium mt-[7px] text-[10px] tracking-[0.03em] text-ink/45">
          {copy.trail(REACHED_COUNT, CAST_FIXTURE.length, CAST_FIXTURE[REACHED_COUNT].level)}
        </Text>
      </View>

      <ScrollView className="mt-[16px] flex-1" contentContainerClassName="gap-[10px] pb-[10px]">
        {CAST_FIXTURE.map((member, index) => (
          <AddressBookEntry
            key={member.name}
            member={member}
            status={statusFor(index)}
            expanded={expandedIndices.has(index)}
            onToggle={() => toggleExpanded(index)}
            onTalkPress={() => router.push('/converse')}
            isFirst={index === 0}
            isLast={index === CAST_FIXTURE.length - 1}
          />
        ))}
      </ScrollView>
    </View>
  );
}
