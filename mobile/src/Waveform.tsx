import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Theme } from './theme';

const BARS = 28;
const MAX_HEIGHT = 44;

/**
 * A live voice trace while recording: one bar per sample of the microphone
 * level, newest on the right. `tick` changes on every sample, so a stretch of
 * silence still scrolls (as a flat line) instead of freezing.
 */
export function Waveform({ level, tick, active, theme }: { level: number; tick: number; active: boolean; theme: Theme }) {
  const [bars, setBars] = useState<number[]>(() => new Array(BARS).fill(0));

  useEffect(() => {
    if (!active) {
      setBars(new Array(BARS).fill(0));
      return;
    }
    setBars(prev => [...prev.slice(1), Math.min(1, level * 5)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one bar per tick, whatever the level
  }, [tick, active]);

  return (
    <View accessibilityLabel="Microphone level" style={styles.row}>
      {bars.map((value, i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: Math.max(4, Math.round(value * MAX_HEIGHT)),
            borderRadius: 2,
            backgroundColor: value > 0.02 ? theme.accent : theme.border,
            opacity: 0.35 + 0.65 * (i / BARS),
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: MAX_HEIGHT + 4, marginTop: 8 },
});
