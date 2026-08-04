import type { BenchmarkItem } from '../api';
import { Pressable, Text, View } from 'react-native';

type BenchmarkItemCardProps = {
  item: BenchmarkItem;
  selectedChoiceIndex: number | undefined;
  onPlayClip: (audioUrl: string) => void;
  onSelectChoice: (itemId: string, choiceIndex: number) => void;
};

/** One audio clip + multiple-choice question, extracted from benchmark-screen.tsx to keep the screen component under the line-count limit. */
export function BenchmarkItemCard({ item, selectedChoiceIndex, onPlayClip, onSelectChoice }: BenchmarkItemCardProps) {
  return (
    <View className="mb-[18px] rounded-[16px] border border-ink/10 bg-white p-[17px]">
      <Pressable
        onPress={() => onPlayClip(item.audioUrl)}
        accessibilityRole="button"
        accessibilityLabel="Play clip"
        className="mb-[14px] items-center rounded-[13px] border border-ink/16 py-[13px]"
      >
        <Text className="font-sans-medium text-[15px] text-ink">▸ Play clip</Text>
      </Pressable>
      <Text className="font-cyrillic-medium mb-[12px] text-[16px] leading-[22px] text-ink">{item.question}</Text>
      {item.choices.map((choice, choiceIndex) => {
        const isSelected = selectedChoiceIndex === choiceIndex;
        return (
          <Pressable
            key={choice}
            onPress={() => onSelectChoice(item.id, choiceIndex)}
            accessibilityRole="button"
            accessibilityLabel={choice}
            className={`mb-[8px] rounded-[13px] px-[14px] py-[12px] ${
              isSelected ? 'bg-accent' : 'border border-ink/16 bg-white'
            }`}
          >
            <Text className={`font-cyrillic-medium text-[15px] ${isSelected ? 'text-page' : 'text-ink/70'}`}>{choice}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
