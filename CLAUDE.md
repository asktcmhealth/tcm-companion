# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

"TCM Consultation Scribe" helps Singapore-based Traditional Chinese Medicine (TCM) physicians turn a
recorded consultation into a draft prescription/acupuncture list for the physician to review. There
are now three runnable parts plus the planning docs:

- `benchmark/` -- Python correction/extraction engine (fuzzy-pinyin herb and acupoint correction,
  dosage extraction and range checks, de-identification) and the ASR benchmark scripts.
- `app/` -- desktop app: Tauri v2 (Rust) + TypeScript UI, with two PyInstaller sidecars
  (`app/sidecar` = text pipeline, `app/sidecar_whisper` = faster-whisper transcription).
- `mobile/` -- React Native app (Android; iOS built in the cloud via Codemagic, no Mac needed) running
  whisper.rn + a TypeScript port of the engine, fully offline.
- Planning docs below remain the authoritative product/architecture spec.

Decisions made while building (details in `plan-review.md`, "Mobile app: data-handling decisions"):

- The Python engine and the TypeScript port (`mobile/src/correctHerbs.ts`, `pipeline.ts`) MUST stay
  in lock-step. Parity is enforced by fixtures generated from Python -- after any engine change run
  `python benchmark/tests/generate_parity_fixtures.py`, then the mobile tests.
- Uncertain matches are flagged (ambiguity margin), never silently resolved; every dose gets a
  physician "dose checked" tick; shared/copied drafts carry the unsigned-draft warning and mark
  uncertain/unchecked entries. No sign-off step exists yet.
- Mobile never sends transcripts to an LLM, so de-identification is desktop-only.
- Audio retention: in-app recordings are deleted after 30 days by default (90 optional).
- The herb (126) and acupoint (58) databases are DRAFTS with no physician sign-off yet; review
  sheets are in `physician-review/`. Do not present them as verified.
- Do not add a Whisper `initial_prompt` herb list: it caused hallucinated paragraphs on desktop and
  gave no gain on mobile.
- Real recordings never go in the repo (`audio recording/` is gitignored; script 2 contains
  patient-style details). Only the script-1 read-aloud was committed, temporarily, for CI.

## Commands

```
python -m unittest discover -s benchmark/tests -v      # engine + sidecar regression tests (no pytest)
python benchmark/tests/generate_parity_fixtures.py     # regenerate mobile parity fixtures from Python

cd mobile && npx jest                                  # mobile tests
cd mobile && npx tsc --noEmit -p .                     # mobile typecheck
cd mobile/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a   # Android APK

cd app && npx tsc --noEmit                             # desktop UI typecheck
cd app && npm run tauri dev                            # run desktop app (run from app/, not ~)
cd app/src-tauri && cargo test --lib                   # Rust tests

# Rebuild the text sidecar after ANY change under benchmark/ that the desktop pipeline uses
# (heavy on an 8 GB machine: close other apps first). The installed .exe goes stale otherwise.
cd app/sidecar && python -m PyInstaller main.spec --noconfirm
cp app/sidecar/dist/main.exe app/src-tauri/binaries/main-x86_64-pc-windows-msvc.exe
```

iOS: `codemagic.yaml` (repo root) has simulator build, simulator screenshot, end-to-end (real audio,
needs `mobile/e2e/audio.m4a` supplied temporarily) and device-build workflows; see `mobile/IOS_BUILD.md`.

Run the Whisper TCM ASR benchmark against a recording:

```
python benchmark/run_benchmark.py <audio_file.mp3|wav>
```

- No `requirements.txt` -- the script self-installs `openai-whisper` and `jiwer` via pip on first run.
- Prompts whether the file is the canonical simulation recording (`benchmark/simulation_script.txt`);
  if yes, it scores herb-name recognition against `SIMULATION_HERBS` with a **95% accuracy pass
  threshold** (physician-set, zero-tolerance for herb errors).
- Outputs `<file>_benchmark_report.txt` and `<file>_transcript.txt` next to the input audio.

## Architecture (locked decisions — see [plan-review.md](plan-review.md))

The product is **not built yet**, but the architecture is decided:

- **Desktop app** (Electron or Tauri, Tauri vs Electron still open — see TODO #7), not a web/cloud app.
  Audio is processed locally so it never leaves the physician's machine (PDPA driver).
- **Pipeline**: consent UI → local audio capture → local Whisper (zh-CN) → pyannote.audio speaker
  diarisation → **de-identification layer** (strips name/NRIC/phone) → relay server → private
  SG-region LLM server (Ollama/vLLM) for note structuring → physician review/edit → PIN-gated
  sign-off → local DB.
- **LLM is structurally blocked from writing certain fields.** `pattern_identification` and
  `treatment_principle` are `source: manual_only` — enforced at the data layer, not just the UI.
  Prescription herbs come only from a validated herb database with autocomplete (`db_confirmed`
  flag); the LLM never generates or suggests herbs or dosages. This constraint exists because
  physicians expressed zero tolerance for herb/dosage errors — do not weaken it when implementing.
- **Note schema** lives in `plan-review.md` (`schema_version: "1.1"`) as the canonical JSON shape for
  a consultation record. It's versioned — bump `schema_version` on any field change. Empty
  `rag_citations`/`related_classical_refs` arrays are pre-added for a future RAG feature; don't
  redesign the schema to add them.
- **API keys are never bundled in the app** — LLM calls are routed through a private relay server for
  per-physician licence control.
- Full failure-mode registry (what's rescued, tested, logged, user-visible) is in `plan-review.md`
  under "Failure Modes Registry" — check it before assuming a given failure path is already handled.

## Key documents

- [brainstorm-analysis.md](brainstorm-analysis.md) — market/product/technical/regulatory/GTM strategy
  brainstorm. Establishes the v1 scope: **Feature 1 (Consultation Scribe) only** — no literature RAG,
  no treatment guidance, no China/Malaysia market, no billing/telemedicine. Later features are
  intentionally deferred (RAG and treatment guidance in particular carry SaMD regulatory risk).
- [plan-review.md](plan-review.md) — the locked architecture, note schema, failure-mode registry,
  performance targets, and TODO list. This is the primary spec to check before implementing anything.
- [physician-schema-review.md](physician-schema-review.md) — the feedback form sent to physicians to
  validate the note layout; `Practioner feedback/` holds the completed responses (Elynda, Julie) that
  produced schema v1.1's changes (documented at the top of `plan-review.md`).
- [regulatory/HSA_consultation_guide.md](regulatory/HSA_consultation_guide.md) — explains Singapore's
  HSA/SaMD classification and contains the drafted pre-submission consultation email. Feature 1 is
  believed to be **not SaMD** (physician reviews/signs off everything, no AI diagnosis or treatment
  suggestion) but this must be confirmed with HSA before public launch, and re-confirmed separately
  before adding RAG or treatment-guidance features.

## Constraints that apply to any future code

- **Regulatory**: don't let UI copy, prompts, or output imply the AI is diagnosing, suggesting, or
  assisting a clinical decision — that crosses into SaMD territory. Structuring what the physician
  said is fine; suggesting a formula or pattern is not.
- **PDPA/data residency**: no PII (name, NRIC, phone) may reach the LLM API — it must be stripped by
  the de-identification layer first. Audio must respect the configured retention policy
  (`delete_on_sign | 30_days | 90_days`) and never be sent to the cloud.
- **Herb/dosage safety**: no LLM-generated herb names or dosages. Any prescription herb not confirmed
  against the herb DB (`db_confirmed: false`) must surface a warning before sign-off.
