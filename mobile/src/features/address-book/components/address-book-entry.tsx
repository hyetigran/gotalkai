import type { CastMember, EntryStatus } from '../address-book-fixture';
import { AnimatePresence, MotiView } from 'moti';
import { Image, Pressable, Text, View } from 'react-native';

import { motion, shadows } from '@/components/ui/design-tokens';
import { CAST_PORTRAITS } from '../../cast/cast-assets';
import { ADDRESS_BOOK_COPY as copy } from '../address-book-fixture';
import { EntryExpandedBody } from './entry-expanded-body';

type AddressBookEntryProps = {
  member: CastMember;
  status: EntryStatus;
  expanded: boolean;
  onToggle: () => void;
  onTalkPress: () => void;
  /** First entry's top rail segment needs a `min-height` so the ribbon visibly starts at the list's top. */
  isFirst: boolean;
  /** Last entry's bottom rail segment is transparent — the ribbon doesn't run past the list. */
  isLast: boolean;
};

/**
 * One address-book row: rail segment (README: "Left column is `14px`
 * wide... railTop → node → railBottom") plus the entry card itself
 * (collapsed row, optionally expanded body).
 */
export function AddressBookEntry({ member, status, expanded, onToggle, onTalkPress, isFirst, isLast }: AddressBookEntryProps) {
  const reached = status === 'reached';
  const next = status === 'next';
  const sealed = status === 'sealed';

  const railColor = reached ? 'bg-accent' : 'bg-ink/14';
  const gateText = reached
    ? copy.gate.playingNow
    : next
      ? copy.gate.nextUp
      : `${copy.gate.sealedPrefix}${member.level}`;

  return (
    <View className="flex-row items-stretch gap-[12px]">
      <View className="w-[14px] items-center pt-[2px]">
        <View className={`w-[2px] flex-1 ${railColor}`} style={isFirst ? { minHeight: 10 } : undefined} />
        {reached && <View className="size-[13px] rounded-full bg-accent" />}
        {next && <View className="size-[9px] rounded-full border-2 border-dashed border-accent/60 bg-page" />}
        {sealed && <View className="size-[9px] rounded-full border-[1.5px] border-ink/20 bg-page" />}
        <View className={`w-[2px] flex-1 ${isLast ? 'bg-transparent' : railColor}`} />
      </View>

      <Pressable
        onPress={onToggle}
        className={`flex-1 rounded-[20px] bg-white px-[16px] py-[14px] ${
          next ? 'border border-dashed border-accent/50' : 'border border-ink/11'
        }`}
        style={reached ? shadows.reachedEntry : undefined}
      >
        <View className="flex-row items-center gap-[13px]">
          <View
            className={`overflow-hidden rounded-full ${
              reached
                ? 'size-[52px] border-2 border-accent'
                : next
                  ? 'size-[42px] border-[1.5px] border-dashed border-accent/55'
                  : 'size-[42px] border-[1.5px] border-ink/16'
            }`}
          >
            <Image
              source={CAST_PORTRAITS[member.castId]}
              resizeMode="cover"
              style={{ width: '100%', height: '100%' }}
              accessibilityIgnoresInvertColors
              accessibilityLabel={member.name}
            />
          </View>

          <View className="flex-1">
            <View className="flex-row items-baseline justify-between gap-[10px]">
              <Text
                className={`font-sans-semibold ${reached ? 'text-[19px] tracking-[-0.19px]' : 'text-[17px]'} ${sealed ? 'text-ink/60' : 'text-ink'}`}
              >
                {member.name}
              </Text>
              <Text className="font-mono-medium text-[9px] tracking-[0.06em] text-ink/40">{member.level}</Text>
            </View>
            <Text className="font-sans-medium mt-[4px] text-[14px] leading-[20px] text-ink/62">
              {member.role}
            </Text>
            <Text
              className={`font-sans-semibold mt-[6px] text-[9px] tracking-[0.09em] uppercase ${
                sealed ? 'text-ink/38' : 'text-accent'
              }`}
            >
              {gateText}
            </Text>
          </View>
        </View>

        <AnimatePresence initial={false}>
          {expanded
            ? (
                <MotiView
                  key="expanded"
                  from={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'timing', duration: motion.castExpandMs }}
                  style={{ overflow: 'hidden' }}
                >
                  <EntryExpandedBody member={member} status={status} onTalkPress={onTalkPress} />
                </MotiView>
              )
            : null}
        </AnimatePresence>
      </Pressable>
    </View>
  );
}
