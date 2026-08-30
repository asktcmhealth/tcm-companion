// Traditional-to-Simplified normalization. Confirmed empirically on real
// consultation audio: whisper.cpp's ggml-small model (mobile) outputs
// Traditional Chinese characters for some recordings even though the
// physician spoke in Simplified-standard Mandarin -- desktop's
// faster-whisper never did this on the same audio. Every trigger phrase,
// end-marker, and herb/acupoint name in this codebase is written in
// Simplified script, so without this normalization step the whole
// correction/extraction pipeline silently finds nothing on a Traditional
// transcript (confirmed: 0 spans, 0 herbs on both real test recordings
// before this fix). Normalize once, right after transcription, so every
// downstream matcher can stay Simplified-only rather than needing a
// Traditional variant of every string constant.

import * as OpenCC from 'opencc-js';

const converter = OpenCC.Converter({ from: 'tw', to: 'cn' });

export function toSimplified(text: string): string {
  return converter(text);
}
