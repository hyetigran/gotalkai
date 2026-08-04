import type { CastMember, EntryStatus } from '../address-book-fixture';
import { Pressable, Text, View } from 'react-native';

import { shadows } from '@/components/ui/design-tokens';
import { CONVERSATIONS_PER_LEVEL, ADDRESS_BOOK_COPY as copy, REACHED_COUNT } from '../address-book-fixture';
import { DifficultyDial } from './difficulty-dial';
import { RegisterMeter } from './register-meter';

type EntryExpandedBodyProps = {
  member: CastMember;
  status: EntryStatus;
  onTalkPress: () => void;
};

/**
 * The expanded body of an address-book entry: register description, two
 * register meters, three difficulty dials, the next-entry requirement
 * line, and the reached-entry "Talk to" button. Split out of
 * `AddressBookEntry` to keep that component under the repo's
 * max-lines-per-function limit.
 *
 * No portrait here — the collapsed row's disc (`AddressBookEntry`) already
 * shows it; repeating it here just duplicated the same image within one
 * card.
 */
export function EntryExpandedBody({ member, status, onTalkPress }: EntryExpandedBodyProps) {
  const reached = status === 'reached';
  const next = status === 'next';

  return (
    <View className="mt-[15px] border-t border-ink/8 pt-[15px]">
      <Text className="text-[14px] leading-[21px] text-ink/62">{member.trains}</Text>

      <View className="mt-[16px] gap-[13px]">
        <RegisterMeter
          leftLabel={copy.axisFormal}
          rightLabel={copy.axisCasual}
          dotPercent={member.registerAxes.formalCasualPercent}
          reached={reached}
        />
        <RegisterMeter
          leftLabel={copy.axisTransactional}
          rightLabel={copy.axisRelational}
          dotPercent={member.registerAxes.transactionalRelationalPercent}
          reached={reached}
        />
      </View>

      <View className="mt-[16px] gap-[8px]">
        {copy.dialLabels.map((label, index) => (
          <DifficultyDial key={label} label={label} value={member.dials[index]} reached={reached} />
        ))}
      </View>

      {next && (
        <Text className="font-sans-semibold mt-[15px] text-[10px] leading-[15px] text-accent">
          {copy.requirement(CONVERSATIONS_PER_LEVEL * REACHED_COUNT)}
        </Text>
      )}

      {reached && (
        <Pressable
          onPress={onTalkPress}
          className="mt-[16px] items-center rounded-[20px] bg-accent py-[15px]"
          style={shadows.brandButton}
        >
          <Text className="font-sans-semibold text-[16px] text-page">
            {copy.talkToPrefix}
            {member.name}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
