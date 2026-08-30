"""
Speaker diarization test -- UNGATED path (SpeechBrain x-vectors + clustering),
not the pyannote.audio pipeline the architecture doc names, because that
requires a personal HuggingFace token (gated model, can't be provided by an
assistant on someone else's behalf).

CAVEAT: this is a lower-effort stand-in to unblock testing, not a claim that
it matches pyannote's accuracy. pyannote's purpose-built diarization pipeline
is generally stronger than manually chaining VAD + x-vector + clustering.
If/when a HF token is available, plan-review.md's original choice
(pyannote.audio + whisper-diarization pipeline) should be re-tested against
this for a real comparison.

Approach: silence-based VAD (pydub, no extra model) -> segment -> x-vector
embedding per segment (speechbrain/spkrec-xvect-voxceleb, ungated) ->
2-cluster agglomerative clustering (physician vs patient).

Usage:
    python run_diarization.py <audio_file>
"""

import sys
import os

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import types

# speechbrain's YAML config resolver walks the full speechbrain.lobes.models
# package to locate Xvector, which as a side effect touches a lazy-loaded
# k2_fsa integration requiring the optional 'k2' package (a lattice-decoding
# library with no Windows wheel -- needs a full C++/CUDA build toolchain we
# don't have and don't actually need for x-vector embedding extraction).
# Stub it out so the unrelated import succeeds without needing real k2.
sys.modules.setdefault("k2", types.ModuleType("k2"))

import numpy as np
from pydub import AudioSegment
from pydub.silence import detect_nonsilent


def format_ts(ms):
    s = ms / 1000
    return f"{int(s // 60)}:{s % 60:05.2f}"


def main():
    if len(sys.argv) < 2:
        print("Usage: python run_diarization.py <audio_file>")
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"Error: File not found: {audio_path}")
        sys.exit(1)

    print("Loading audio...")
    audio = AudioSegment.from_file(audio_path).set_channels(1).set_frame_rate(16000)

    print("Running silence-based VAD...")
    nonsilent = detect_nonsilent(audio, min_silence_len=500, silence_thresh=audio.dBFS - 16, seek_step=100)
    segments = [(s, e) for s, e in nonsilent if e - s >= 1000]
    print(f"  {len(segments)} speech segments found")
    if len(segments) < 2:
        print("Not enough segments for clustering -- aborting")
        sys.exit(1)

    print("Loading speechbrain/spkrec-xvect-voxceleb (ungated, no token needed)...")
    from speechbrain.inference.speaker import EncoderClassifier
    from speechbrain.utils.fetching import LocalStrategy
    # Windows needs Developer Mode or admin rights to create symlinks; default
    # SYMLINK strategy fails with WinError 1314 without them. COPY avoids
    # symlinks entirely (uses more disk space, but works without elevation).
    classifier = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-xvect-voxceleb",
        savedir="pretrained_models/spkrec-xvect-voxceleb",
        run_opts={"device": "cpu"},
        local_strategy=LocalStrategy.COPY,
    )

    print("Extracting x-vector embeddings per segment...")
    os.makedirs("_diarization_tmp", exist_ok=True)
    embeddings = []
    for i, (s, e) in enumerate(segments):
        tmp_path = f"_diarization_tmp/{i}.wav"
        audio[s:e].export(tmp_path, format="wav")
        wav = classifier.load_audio(tmp_path)
        emb = classifier.encode_batch(wav)
        embeddings.append(emb.squeeze().detach().cpu().numpy())
        os.remove(tmp_path)
    os.rmdir("_diarization_tmp")

    print("Clustering into 2 speakers (physician / patient)...")
    from sklearn.cluster import AgglomerativeClustering
    labels = AgglomerativeClustering(n_clusters=2, metric="cosine", linkage="average").fit_predict(np.array(embeddings))

    print("\n" + "=" * 65)
    print("  DIARIZATION REPORT (SpeechBrain x-vector, ungated)")
    print("=" * 65)
    speaking_time = {0: 0, 1: 0}
    for (s, e), lbl in zip(segments, labels):
        speaking_time[lbl] += (e - s)
        print(f"  [{format_ts(s)} -> {format_ts(e)}]  SPEAKER_{lbl:02d}")

    print("\n--- Speaking time per cluster ---")
    for lbl, ms in speaking_time.items():
        print(f"  SPEAKER_{lbl:02d}: {ms/1000:.1f}s across "
              f"{sum(1 for l in labels if l == lbl)} segments")

    out_path = audio_path.rsplit(".", 1)[0] + "_diarization.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        for (s, e), lbl in zip(segments, labels):
            f.write(f"[{format_ts(s)} -> {format_ts(e)}]  SPEAKER_{lbl:02d}\n")
    print(f"\nSaved to: {out_path}")


if __name__ == "__main__":
    main()
