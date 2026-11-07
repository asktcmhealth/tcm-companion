import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { Theme } from './theme';

const BARS = 21;
const HEIGHT = 48;
const MIN_SCALE = 0.1;
const SAMPLE_MS = 100;

// Taller in the middle, shorter at the edges, so the row reads as one shape.
const shape = (i: number) => 0.4 + 0.6 * Math.sin((Math.PI * (i + 0.5)) / BARS);

/**
 * A live voice indicator while recording. The bars never move sideways or jump:
 * each one stays where it is and eases to a new height (a native-driven scale,
 * so it costs no layout work), driven by a smoothed copy of the microphone
 * level -- quick to rise with the voice, slow to fall back -- with a small
 * per-bar ripple so it looks alive. It polls `sample` itself, so the rest of
 * the screen does not re-render while the physician is talking.
 */
export function Waveform({ sample, theme }: { sample: () => number; theme: Theme }) {
  const bars = useRef(Array.from({ length: BARS }, () => new Animated.Value(MIN_SCALE))).current;
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  useEffect(() => {
    let envelope = 0;
    let step = 0;
    const id = setInterval(() => {
      const raw = Math.min(1, sampleRef.current() * 5);
      envelope = raw > envelope ? envelope * 0.35 + raw * 0.65 : envelope * 0.82 + raw * 0.18;
      step += 1;
      bars.forEach((bar, i) => {
        const ripple = 0.7 + 0.3 * Math.sin(step * 0.8 + i * 1.1);
        const target = Math.max(MIN_SCALE, Math.min(1, envelope * shape(i) * ripple * 1.25));
        Animated.timing(bar, {
          toValue: target,
          duration: SAMPLE_MS + 30,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    }, SAMPLE_MS);
    return () => {
      clearInterval(id);
      bars.forEach(bar => bar.stopAnimation());
    };
  }, [bars]);

  return (
    <View accessibilityLabel="Microphone level" style={styles.row}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, { backgroundColor: theme.accent, transform: [{ scaleY: bar }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: HEIGHT + 8, marginTop: 8 },
  bar: { width: 5, height: HEIGHT, borderRadius: 3 },
});
