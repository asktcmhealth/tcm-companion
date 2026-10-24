import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseDose, type EffectiveHerb, type EffectivePoint } from './herbEdits';
import type { ReviewStatus } from './review';
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

function LinkButton({
  label,
  onPress,
  theme,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  theme: Theme;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={8}
      style={[styles.actionButton, { borderColor: theme.border, backgroundColor: theme.cardSunken }]}>
      <Text style={[styles.actionText, { color: theme.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function ReviewPanel({
  theme,
  t,
  status,
  reviewedTime,
  onReview,
}: {
  theme: Theme;
  t: TFn;
  status: ReviewStatus;
  reviewedTime: string | null;
  onReview: () => void;
}) {
  const waiting = [
    status.uncheckedDoses > 0 ? t('review_wait_unchecked', { n: status.uncheckedDoses }) : '',
    status.unresolved > 0 ? t('review_wait_unresolved', { n: status.unresolved }) : '',
  ].filter(Boolean);
  if (status.nothingToReview) return null;
  return (
    <View style={[styles.reviewBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {reviewedTime ? (
        <Text accessibilityRole="alert" style={[styles.reviewDone, { color: theme.accent }]}>
          ✓ {t('review_done', { time: reviewedTime })}
        </Text>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !status.ready }}
            disabled={!status.ready}
            onPress={onReview}
            style={[styles.reviewButton, { backgroundColor: status.ready ? theme.accent : theme.disabled }]}>
            <Text style={[styles.reviewButtonText, { color: theme.onAccent }]}>{t('review_button')}</Text>
          </Pressable>
          {waiting.length > 0 && (
            <Text style={[styles.note, { color: theme.inkMuted }]}>{waiting.join(' · ')}</Text>
          )}
        </>
      )}
      <Text style={[styles.note, { color: theme.inkMuted }]}>{t('review_note')}</Text>
    </View>
  );
}

const countPart = (t: TFn, key: string, n: number) => (n > 0 ? t(key, { n }) : '');

export function HerbList({
  herbs,
  theme,
  t,
  confirmed,
  onToggleDose,
  onKeep,
  onSwap,
  onSetDose,
  onUndo,
}: {
  herbs: EffectiveHerb[];
  theme: Theme;
  t: TFn;
  confirmed: ReadonlySet<number>;
  onToggleDose: (index: number) => void;
  onKeep: (index: number) => void;
  onSwap: (index: number) => void;
  onSetDose: (index: number, grams: number) => void;
  onUndo: (index: number) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const startEdit = (i: number, dosage: number) => {
    setEditing(i);
    setDraft(String(dosage));
    setInvalid(false);
  };
  const saveEdit = (i: number) => {
    const grams = parseDose(draft);
    if (grams === null) {
      setInvalid(true);
      return;
    }
    onSetDose(i, grams);
    setEditing(null);
  };
  const parts = [
    countPart(t, 'review_part_verify', herbs.filter(h => h.ambiguous).length),
    countPart(t, 'review_part_range', herbs.filter(h => h.dosageWarning).length),
    countPart(t, 'review_part_risk', herbs.filter(h => h.highRisk).length),
  ].filter(Boolean);

  return (
    <View>
      <ReviewBanner parts={parts} theme={theme} t={t} />
      <Text accessibilityRole="text" style={[styles.progress, { color: theme.inkMuted }]}>
        {t('dose_progress', { n: confirmed.size, total: herbs.length })}
      </Text>
      <Text style={[styles.note, { color: theme.inkMuted, marginTop: 0, marginBottom: 8 }]}>{t('dose_hint')}</Text>
      {herbs.map((h, i) => (
        <View
          key={`${h.name}-${i}`}
          style={[
            styles.row,
            { backgroundColor: theme.card, borderColor: theme.border },
            h.ambiguous && { borderLeftWidth: 3, borderLeftColor: theme.verifyInk },
          ]}>
          <View style={styles.rowTop}>
            <Pressable
              onPress={() => onToggleDose(i)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed.has(i) }}
              accessibilityLabel={`${h.name} ${h.dosage} ${h.unit}: ${t('dose_confirm')}`}
              hitSlop={8}
              style={styles.tickAndName}>
              <View
                style={[
                  styles.box,
                  { borderColor: theme.inkMuted },
                  confirmed.has(i) && { backgroundColor: theme.verifyInk, borderColor: theme.verifyInk },
                ]}>
                {confirmed.has(i) && <Text style={styles.tick}>✓</Text>}
              </View>
              <Text style={[styles.name, { color: theme.ink }]}>
                {h.name} <Text style={[styles.meta, { color: theme.inkMuted }]}>{h.dosage}{h.unit}</Text>
              </Text>
            </Pressable>
            <View style={styles.chips}>
              {h.ambiguous && (
                <Chip label={t('badge_verify')} bg={theme.verifyBg} ink={theme.verifyInk} border={theme.verifyBorder} />
              )}
              {h.highRisk && (
                <Chip label={t('badge_high_risk')} bg={theme.warnBg} ink={theme.warnInk} border={theme.warnBorder} />
              )}
              {(h.edited || h.confirmed) && (
                <Chip
                  label={t(h.edited ? 'chip_edited' : 'chip_confirmed')}
                  bg={theme.cardSunken}
                  ink={theme.ink}
                  border={theme.border}
                />
              )}
              {editing !== i && (
                <LinkButton
                  label={t('edit_dose')}
                  onPress={() => startEdit(i, h.dosage)}
                  theme={theme}
                  accessibilityLabel={`${h.name} ${t('edit_dose')}`}
                />
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
          {h.edited && (
            <Text style={[styles.note, { color: theme.inkMuted }]}>
              {t('edited_from', { name: h.originalName, dose: h.originalDosage })}
            </Text>
          )}
          {editing === i ? (
            <View style={styles.editRow}>
              <TextInput
                value={draft}
                onChangeText={text => {
                  setDraft(text);
                  setInvalid(false);
                }}
                keyboardType="decimal-pad"
                autoFocus
                accessibilityLabel={`${h.name}: ${t('edit_dose')}`}
                onSubmitEditing={() => saveEdit(i)}
                style={[
                  styles.input,
                  { color: theme.ink, borderColor: invalid ? theme.danger : theme.border, backgroundColor: theme.card },
                ]}
              />
              <Text style={{ color: theme.inkMuted }}>g</Text>
              <LinkButton label={t('dose_save')} onPress={() => saveEdit(i)} theme={theme} />
              <LinkButton label={t('dose_cancel')} onPress={() => setEditing(null)} theme={theme} />
            </View>
          ) : (
            (h.ambiguous || h.edited || h.confirmed) && (
              <View style={styles.actionRow}>
                {h.ambiguous && (
                  <>
                    <LinkButton label={t('keep_term', { name: h.name })} onPress={() => onKeep(i)} theme={theme} />
                    {h.ambiguousWith && (
                      <LinkButton label={t('use_term', { name: h.ambiguousWith })} onPress={() => onSwap(i)} theme={theme} />
                    )}
                  </>
                )}
                {(h.edited || h.confirmed) && <LinkButton label={t('undo_edit')} onPress={() => onUndo(i)} theme={theme} />}
              </View>
            )
          )}
          {editing === i && invalid && (
            <Text accessibilityRole="alert" style={[styles.note, { color: theme.danger }]}>
              {t('dose_invalid')}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export function PointList({
  points,
  theme,
  t,
  onKeep,
  onSwap,
  onUndo,
}: {
  points: EffectivePoint[];
  theme: Theme;
  t: TFn;
  onKeep: (index: number) => void;
  onSwap: (index: number) => void;
  onUndo: (index: number) => void;
}) {
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
            {(p.edited || p.confirmed) && (
              <Chip
                label={t(p.edited ? 'chip_edited' : 'chip_confirmed')}
                bg={theme.cardSunken}
                ink={theme.ink}
                border={theme.border}
              />
            )}
          </View>
          {p.ambiguous && (
            <Text style={[styles.note, { color: theme.inkMuted }]}>
              {t('verify_note', { alt: p.ambiguousWith ?? '?' })}
            </Text>
          )}
          {(p.ambiguous || p.edited || p.confirmed) && (
            <View style={styles.actionRow}>
              {p.ambiguous && (
                <>
                  <LinkButton label={t('keep_term', { name: p.name })} onPress={() => onKeep(i)} theme={theme} />
                  {p.ambiguousWith && (
                    <LinkButton label={t('use_term', { name: p.ambiguousWith })} onPress={() => onSwap(i)} theme={theme} />
                  )}
                </>
              )}
              {(p.edited || p.confirmed) && <LinkButton label={t('undo_edit')} onPress={() => onUndo(i)} theme={theme} />}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 },
  bold: { fontWeight: '700' },
  row: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 14, fontWeight: '400' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  editRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 32,
    justifyContent: 'center',
  },
  actionText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, minWidth: 64, fontSize: 15 },
  reviewBox: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 4, marginBottom: 8 },
  reviewButton: { borderRadius: 8, paddingVertical: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  reviewButtonText: { fontSize: 16, fontWeight: '700' },
  reviewDone: { fontSize: 16, fontWeight: '700' },
  progress: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  tickAndName: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minHeight: 32 },
  confirmLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  box: { width: 22, height: 22, borderWidth: 2, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 14, fontWeight: '800', lineHeight: 16 },
  confirmLabel: { fontSize: 13 },
  note: { fontSize: 12.5, marginTop: 4, lineHeight: 17 },
});
