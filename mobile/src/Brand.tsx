import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { serifFont, type Theme } from './theme';

// Small decorative pieces drawn from plain Views (no image or SVG dependency).

function Leaf({ color, size, rotate, left, top }: { color: string; size: number; rotate: string; left: number; top: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        backgroundColor: color,
        borderTopLeftRadius: size,
        borderBottomRightRadius: size,
        borderTopRightRadius: size * 0.1,
        borderBottomLeftRadius: size * 0.1,
        transform: [{ rotate }],
      }}
    />
  );
}

/** A small herb sprig: a stem with three leaves. Used as the app mark and the welcome picture. */
export function Sprig({ theme, size = 44 }: { theme: Theme; size?: number }) {
  const u = size / 44;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: 21 * u,
          top: 10 * u,
          width: 2 * u,
          height: 32 * u,
          backgroundColor: theme.brass,
          borderRadius: u,
        }}
      />
      <Leaf color={theme.accent} size={17 * u} rotate="0deg" left={22 * u} top={2 * u} />
      <Leaf color={theme.accent} size={14 * u} rotate="-90deg" left={6 * u} top={14 * u} />
      <Leaf color={theme.accentStrong} size={14 * u} rotate="0deg" left={24 * u} top={20 * u} />
    </View>
  );
}

/** A thin brass rule with a small diamond in the middle: the page's quiet ornament. */
export function Ornament({ theme }: { theme: Theme }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.ornament}>
      <View style={[styles.rule, { backgroundColor: theme.border }]} />
      <View style={[styles.diamond, { backgroundColor: theme.brass }]} />
      <View style={[styles.rule, { backgroundColor: theme.border }]} />
    </View>
  );
}

/** Section heading in the serif face, with a short brass underline. */
export function SectionTitle({ theme, children }: { theme: Theme; children: string }) {
  return (
    <View style={styles.titleWrap}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.ink, fontFamily: serifFont }]}>
        {children}
      </Text>
      <View style={[styles.underline, { backgroundColor: theme.brass }]} />
    </View>
  );
}

/** "1  Record -> 2  Check -> 3  Share": what the app does, at a glance. */
export function Steps({ theme, steps }: { theme: Theme; steps: string[] }) {
  return (
    <View style={styles.steps}>
      {steps.map((label, i) => (
        <View key={label} style={styles.step}>
          <View style={[styles.stepNumber, { borderColor: theme.brass, backgroundColor: theme.brassSoft }]}>
            <Text style={[styles.stepNumberText, { color: theme.brass, fontFamily: serifFont }]}>{i + 1}</Text>
          </View>
          <Text style={[styles.stepLabel, { color: theme.inkMuted }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ornament: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 14 },
  rule: { flex: 1, height: 1 },
  diamond: { width: 7, height: 7, transform: [{ rotate: '45deg' }] },
  titleWrap: { marginBottom: 6 },
  sectionTitle: { fontSize: 22, fontWeight: '700' },
  underline: { width: 36, height: 2, borderRadius: 1, marginTop: 5 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepNumber: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 15, fontWeight: '700' },
  stepLabel: { fontSize: 12, textAlign: 'center', lineHeight: 16 },
});
