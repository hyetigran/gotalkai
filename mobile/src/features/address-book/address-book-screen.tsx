import type { EntryStatus } from './address-book-fixture';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(REACHED_COUNT - 1);

  return (
    <View className="flex-1 bg-paper px-[22px] pt-[60px] pb-[44px]">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="back">
          <Text className="text-[15px] text-accent">‹</Text>
        </Pressable>
        <Text className="font-serif text-[13px] text-ink/60">{copy.castHead}</Text>
        <View className="w-[12px]" />
      </View>

      <View className="mt-[16px]">
        <Text className="font-serif text-[22px] text-ink">{copy.bookHead}</Text>
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
            expanded={expandedIndex === index}
            onToggle={() => setExpandedIndex(prev => (prev === index ? null : index))}
            onTalkPress={() => router.push('/converse')}
            isFirst={index === 0}
            isLast={index === CAST_FIXTURE.length - 1}
          />
        ))}
      </ScrollView>
    </View>
  );
}
