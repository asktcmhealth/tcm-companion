import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from './theme';

// A small leaf drawn from plain Views (no icon/SVG dependency): a square with
// two opposite corners rounded hard, plus a thin vein along its diagonal.
function Leaf({ color, vein }: { color: string; vein: string }) {
  return (
    <View style={styles.leafBox}>
      <View style={[styles.leaf, { backgroundColor: color }]} />
      <View style={[styles.vein, { backgroundColor: vein }]} />
    </View>
  );
}

// Soft ring that swells and fades while recording, so "it is listening" is
// visible at a glance. Skipped entirely when the phone asks for reduced motion.
function Pulse({ color, active }: { color: string; active: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(on => alive && setReduceMotion(on))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!active || reduceMotion) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, progress]);

  if (!active || reduceMotion) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulse,
        {
          borderColor: color,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
        },
      ]}
    />
  );
}

export function RecordButton({
  theme,
  recording,
  disabled,
  label,
  seconds,
  onPress,
}: {
  theme: Theme;
  recording: boolean;
  disabled: boolean;
  label: string;
  seconds: string;
  onPress: () => void;
}) {
  const fill = disabled ? theme.disabled : recording ? theme.danger : theme.accent;
  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        <Pulse color={theme.danger} active={recording} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          hitSlop={12}
          style={[styles.button, { backgroundColor: fill }]}>
          {recording ? (
            <View style={[styles.stopSquare, { backgroundColor: theme.onAccent }]} />
          ) : (
            <Leaf color={theme.onAccent} vein={fill} />
          )}
        </Pressable>
      </View>
      <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>
      {recording && <Text style={[styles.timer, { color: theme.inkMuted }]}>{seconds}</Text>}
    </View>
  );
}

const SIZE = 84;
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 8 },
  stage: { width: SIZE * 1.6, height: SIZE * 1.6, alignItems: 'center', justifyContent: 'center' },
  button: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 3 },
  leafBox: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  leaf: {
    width: 30,
    height: 30,
    borderTopLeftRadius: 30,
    borderBottomRightRadius: 30,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 3,
  },
  vein: { position: 'absolute', width: 2, height: 30, transform: [{ rotate: '45deg' }], opacity: 0.55 },
  stopSquare: { width: 26, height: 26, borderRadius: 6 },
  label: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  timer: { fontSize: 14, marginTop: 2, fontVariant: ['tabular-nums'] },
});
