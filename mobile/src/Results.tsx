import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HerbEntry, AcupointEntry } from './pipeline';
import type { Theme } from './theme';

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

function Chip({ label, bg, ink, border }: { label: string; bg: string; ink: string; border: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.chipText, { color: ink }]}>{label}</Text>
    </View>
  );
}

// One glanceable line above a list: how many entries need a human look
// before sign-off, so a flagged row isn't missed while scrolling.
export function ReviewBanner({ parts, theme, t }: { parts: string[]; theme: Theme; t: TFn }) {
  if (parts.length === 0) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: theme.warnBg, borderColor: theme.warnBorder }]}>
      <Text style={{ color: theme.warnInk, fontSize: 13 }}>
        <Text style={styles.bold}>{t('review_banner')} </Text>
        {parts.join(' · ')}
      </Text>
    </View>
  );
}

const countPart = (t: TFn, key: string, n: number) => (n > 0 ? t(key, { n }) : '');

export function HerbList({ herbs, theme, t }: { herbs: HerbEntry[]; theme: Theme; t: TFn }) {
  const parts = [
    countPart(t, 'review_part_verify', herbs.filter(h => h.ambiguous).length),
    countPart(t, 'review_part_range', herbs.filter(h => h.dosageWarning).length),
    countPart(t, 'review_part_risk', herbs.filter(h => h.highRisk).length),
  ].filter(Boolean);

  return (
    <View>
      <ReviewBanner parts={parts} theme={theme} t={t} />
      {herbs.map((h, i) => (
        <View
          key={`${h.name}-${i}`}
          accessible
          accessibilityLabel={[
            `${h.name} ${h.dosage} ${h.unit}`,
            h.ambiguous ? t('verify_note', { alt: h.ambiguousWith ?? '?' }) : '',
            h.highRisk ? t('badge_high_risk') : '',
            h.dosageWarning ? h.dosageCheckMessage : '',
          ]
            .filter(Boolean)
            .join('. ')}
          style={[
            styles.row,
            { backgroundColor: theme.card, borderColor: theme.border },
            h.ambiguous && { borderLeftWidth: 3, borderLeftColor: theme.verifyInk },
          ]}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: theme.ink }]}>
              {h.name} <Text style={[styles.meta, { color: theme.inkMuted }]}>{h.dosage}{h.unit}</Text>
            </Text>
            <View style={styles.chips}>
              {h.ambiguous && (
                <Chip label={t('badge_verify')} bg={theme.verifyBg} ink={theme.verifyInk} border={theme.verifyBorder} />
              )}
              {h.highRisk && (
                <Chip label={t('badge_high_risk')} bg={theme.warnBg} ink={theme.warnInk} border={theme.warnBorder} />
              )}
            </View>
          </View>
          {h.dosageWarning && (
            <Text style={[styles.note, { color: theme.danger }]}>{h.dosageCheckMessage}</Text>
          )}
          {h.ambiguous && (
            <Text style={[styles.note, { color: theme.inkMuted }]}>
              {t('verify_note', { alt: h.ambiguousWith ?? '?' })}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export function PointList({ points, theme, t }: { points: AcupointEntry[]; theme: Theme; t: TFn }) {
  const parts = [countPart(t, 'review_part_verify', points.filter(p => p.ambiguous).length)].filter(Boolean);
  return (
    <View>
      <ReviewBanner parts={parts} theme={theme} t={t} />
      {points.map((p, i) => (
        <View
          key={`${p.name}-${i}`}
          accessible
          accessibilityLabel={[
            `${p.name}${p.laterality ? ` ${p.laterality}` : ''}, ${p.code}, ${p.meridian}`,
            p.ambiguous ? t('verify_note', { alt: p.ambiguousWith ?? '?' }) : '',
          ]
            .filter(Boolean)
            .join('. ')}
          style={[
            styles.row,
            { backgroundColor: theme.card, borderColor: theme.border },
            p.ambiguous && { borderLeftWidth: 3, borderLeftColor: theme.verifyInk },
          ]}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: theme.ink }]}>
              {p.name}
              {p.laterality ? ` (${p.laterality})` : ''}{' '}
              <Text style={[styles.meta, { color: theme.inkMuted }]}>
                {p.code} · {p.meridian}
              </Text>
            </Text>
            {p.ambiguous && (
              <Chip label={t('badge_verify')} bg={theme.verifyBg} ink={theme.verifyInk} border={theme.verifyBorder} />
            )}
          </View>
          {p.ambiguous && (
            <Text style={[styles.note, { color: theme.inkMuted }]}>
              {t('verify_note', { alt: p.ambiguousWith ?? '?' })}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 },
  bold: { fontWeight: '700' },
  row: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 14, fontWeight: '400' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  note: { fontSize: 12.5, marginTop: 4, lineHeight: 17 },
});
