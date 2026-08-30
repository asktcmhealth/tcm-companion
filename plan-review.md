# TCM Consultation Scribe — Plan Review (HOLD SCOPE)

*plan-ceo-review output. Feature 1 only: TCM Consultation Scribe.*
*Generated: 2026-05-20*

---

## Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| Deployment model | Desktop app (Electron or Tauri) | Audio never leaves device — resolves physician PDPA concern |
| Audio processing | Whisper local, zh-CN first | No audio to cloud; Chinese-primary |
| LLM inference | Private SG-region server (Ollama/vLLM) | Key control, usage visibility, SG data residency |
| LLM model | Evaluate Shizhen / ZMT-M1 vs benchmark | Pick after testing on real consultation audio |
| Model updates | Version manifest + HuggingFace pull | GitHub for code/manifest; HF for weights |
| Prescription/herb | Herb DB autocomplete only — NO LLM | Zero-error-tolerance constraint from physician |
| Pulse documentation | Structured 9-field grid (寸关尺×浮中沉×有力无力) | Eliminates hallucination risk entirely |
| Note schema | Configurable template (per-clinic field visibility/order/labels) | Reduces adoption barrier |
| Recording mode | Full consultation recording with speaker diarisation | Option B — physician preference |
| Speaker diarisation | pyannote.audio + whisper-diarization pipeline | Best open-source option for zh-CN |
| Auth | Username + PIN, PIN encrypts DB session | PDPA compliance for shared clinic machines |
| API key | Routed via your private relay server | No key in app bundle; per-physician licence control |

---

## System Architecture

```
CONSULTATION SCRIBE — FULL SYSTEM

  ┌─────────────────────────────────────────────────────────────────────┐
  │  PHYSICIAN'S MACHINE                                                │
  │                                                                     │
  │  [CONSENT UI] ──consent logged──▶ [AUDIO CAPTURE]                  │
  │                                         │                          │
  │                                         ▼                          │
  │                                   [WHISPER zh-CN]  (local)         │
  │                                         │                          │
  │                                         ▼                          │
  │                              [SPEAKER DIARISATION]                 │
  │                              pyannote.audio                        │
  │                              physician | patient | unknown          │
  │                                         │                          │
  │                                         ▼                          │
  │                                   [DE-ID LAYER]                    │
  │                              (strips name, NRIC, phone)            │
  │                                         │                          │
  │                           ┌─────────────┤                          │
  │                           │             │                          │
  │                    physician            patient                    │
  │                    segments             segments                   │
  │                           │             │                          │
  │                           ▼             ▼                          │
  │  ┌──────────────────────────────────────────────────────────────┐  │
  │  │  [RELAY SERVER] ──▶ [PRIVATE LLM SERVER, SG-region]         │  │
  │  │  (de-id transcript only, no audio, no PII)                  │  │
  │  └──────────────────────────────────────────────────────────────┘  │
  │                           │                                        │
  │                           ▼                                        │
  │                   [NOTE EDITOR]                                    │
  │                   - Chief complaint, systems review, tongue        │
  │                   - Pulse: 9-field structured grid                 │
  │                   - Pattern ID: manual-only (LLM blocked)         │
  │                   - Tx Principle: manual-only (LLM blocked)       │
  │                   - Prescription: herb DB autocomplete only        │
  │                           │                                        │
  │                   [PHYSICIAN SIGN-OFF] (PIN-gated)                │
  │                           │                                        │
  │                     [LOCAL DB]   [AUDIO: retention policy]        │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## Consultation State Machine

```
  [IDLE] ──start──▶ [CONSENT] ──confirmed──▶ [RECORDING]
    ▲                   │                         │
    │              refused/skip                 stop
    │                   │                         │
    │                   ▼                         ▼
    │              [DISCARDED]            [TRANSCRIBING]
    │                                     + DIARISING
    │                                          │
    │                                       success
    │                                          │
    │                                          ▼
    │                                    [STRUCTURING]
    │                                    (LLM via relay)
    │                                     │         │
    │                                 success    api_error
    │                                     │         │
    │                                     ▼         ▼
    │                            [PHYSICIAN_REVIEW] [FALLBACK_DISPLAY]
    │                                    │          (raw transcript)
    │                               save_draft│ approve
    │                                    │         │
    │                                    ▼         ▼
    │                               [DRAFT] ──▶ [SAVING]
    │                                    │         │
    │                             resume_│    save_error / success
    │                             later  │         │
    └────────────── [SAVED] ◀────────────┘   ◀─────┘
                                             (autosave temp on error)

  INVARIANTS (enforced by state machine, not just UI):
  - No recording without consent_recorded = true
  - No SAVED state without physician_attestation.pin_verified = true
  - LLM cannot write to pattern_identification or treatment_principle fields
  - prescription.herbs[] only accepts db_confirmed = true entries (or explicit manual override with warning)
```

---

## Note Schema (v1.1)

*Updated 2026-07-12 based on feedback from 2 additional physicians (Elynda, Julie).*

**Changes from v1.0:**
- Systems review: added `diet` and `stress` fields (Julie)
- Added `current_medications` section — standalone field, not part of medical history (Julie)
- Pulse: added `mode` toggle — `grid` (9-position) vs `freetext` (overall quality); default changed to `freetext` after Elynda confirmed she only records 整体脉象 (Elynda)
- Prescription: added `instructions` block — days, timing, frequency (Elynda)
- `treatment_principle` marked as `optional: true` — Elynda does not use it; configurable per clinic (Elynda)
- Section order confirmed as configurable — Elynda's flow is tongue/pulse before systems review

```json
{
  "schema_version": "1.1",
  "consultation_id": "uuid",
  "patient_id": "uuid",
  "physician_id": "uuid",
  "status": "draft | signed | discarded",
  "consent_recorded": true,
  "consent_timestamp": "ISO8601",
  "audio_path": "local_path | null",
  "audio_retention_policy": "delete_on_sign | 30_days | 90_days",
  "template_id": "clinic_template_uuid",
  "fields": {
    "chief_complaint":     { "value": "", "source": "asr | manual", "confidence": 0.0 },
    "aggravating_factors": { "value": "", "source": "asr | manual" },
    "systems_review": {
      "mood": "", "sleep": "", "appetite": "", "bowel": "",
      "urine": "", "nausea": "", "energy": "",
      "diet": "",
      "stress": ""
    },
    "medical_history":        { "value": "", "source": "manual" },
    "allergies":              { "value": "", "source": "manual" },
    "current_medications":    { "value": "", "source": "manual" },
    "subhealth":              { "value": "", "source": "asr | manual" },
    "tongue":                 { "value": "", "source": "asr | manual" },
    "pulse": {
      "mode": "freetext | grid",
      "freetext": "",
      "grid": {
        "cun_float": "",  "cun_mid": "",  "cun_deep": "",
        "guan_float": "", "guan_mid": "", "guan_deep": "",
        "chi_float": "",  "chi_mid": "",  "chi_deep": "",
        "force": "forceful | weak | moderate"
      }
    },
    "pattern_identification": { "value": "", "source": "manual_only" },
    "treatment_principle":    { "value": "", "source": "manual_only", "optional": true },
    "prescription": {
      "herbs": [
        {
          "name": "",
          "dosage": "",
          "unit": "g | qian",
          "db_confirmed": false,
          "dosage_warning": false
        }
      ],
      "formula_base": "",
      "modifications": "",
      "instructions": {
        "days": "",
        "times_per_day": "",
        "timing": "before_meals | after_meals | empty_stomach | other",
        "notes": ""
      }
    },
    "rag_citations": [],
    "related_classical_refs": []
  },
  "diarisation_segments": [],
  "physician_attestation": {
    "timestamp": null,
    "pin_verified": false
  },
  "created_at": "",
  "updated_at": ""
}
```

**Schema rules:**
- `source: manual_only` fields: LLM write is blocked at the data layer, not just the UI
- `db_confirmed: false` on any herb triggers a warning in the UI before sign-off
- `dosage_warning: true` triggers when value is outside the herb's normal range (requires dosage range table)
- `rag_citations` and `related_classical_refs` are pre-added empty arrays for Feature 3 — no migration needed later
- `treatment_principle.optional: true` — hidden by default for clinics that don't use it; shown when template config enables it
- `pulse.mode` defaults to `freetext`; grid available as opt-in per clinic template
- Schema versioning is mandatory — bump schema_version on any field change

---

## Physician Interview Findings (2026-05-20)

Findings from first physician interview. Validate with 2–3 more before finalising schema.

| Finding | Implication |
|---|---|
| Notes written in Chinese, during consultation | Chinese-first ASR and UI. Real-time or near-real-time preferred. |
| 15 patients × 10 min documentation = 150 min/day | Strong ROI case. SGD 150–200/month pricing justified. |
| Open to recording if PDPA addressed | Desktop-first (audio stays local) is the trust unlock. |
| Patients have privacy concerns | Consent flow is mandatory, not optional. |
| Wrong herb / wrong dosage is #1 worry | Zero tolerance for herb errors. Herb DB only, never LLM on Rx. |
| No tolerance for any herb name errors | Herb autocomplete from validated DB. No auto-populate. |
| Pulse schema: 寸关尺 × 浮中沉 × 有力无力 | 9-field structured grid. No hallucination risk. |
| Notes: "word error, no time to complete" | Autosave draft. Speed is product quality. |
| "Everything" from previous visit | Full history view needed — design patient record for retrieval from day one. |

---

## Critical Gaps (must resolve before first physician goes live)

| # | Gap | Risk |
|---|---|---|
| 1 | De-ID layer not designed | NRIC/name in LLM API call = PDPA breach |
| 2 | No dosage range validation table | Wrong dosage saved silently = clinical risk |
| 3 | No DB write failure recovery | Note lost silently on disk full / write error |
| 4 | Audio retention policy not enforced | Audio retained beyond policy = PDPA risk |

---

## Failure Modes Registry

```
CODEPATH              | FAILURE              | RESCUED? | TEST? | USER SEES?        | LOGGED?
──────────────────────|──────────────────────|──────────|───────|───────────────────|────────
Consent flow          | Patient refuses      | Y        | Y     | Recording blocked | Y
Audio capture         | Mic fails mid-consult| Y        | N     | Alert + manual    | Y
Whisper transcription | Low confidence       | Y        | N     | Yellow highlight  | Y
Whisper transcription | Herb name wrong      | PARTIAL  | N     | Shown as editable | Y
Pyannote diarisation  | Wrong speaker label  | Y        | N     | Physician corrects| Y
Pyannote diarisation  | Complete failure     | Y        | N     | Unlabelled text   | Y
De-ID layer           | Misses NRIC/name     | N←CRIT   | N     | PII in API call   | N←CRIT
LLM server            | Timeout              | Y        | Y     | Raw transcript    | Y
LLM server            | Malformed JSON       | Y        | N     | Raw transcript    | Y
LLM server            | Hallucinates field   | PARTIAL  | N     | Shown as editable | N
Pattern ID field      | LLM attempts write   | Y        | N     | Blocked (schema)  | Y
Herb autocomplete     | Herb not in DB       | Y        | N     | Warning + manual  | Y
Dosage field          | Out of range value   | N←CRIT   | N     | Silent            | N←CRIT
DB write              | Disk full            | N←CRIT   | N     | Note lost         | N←CRIT
App crash             | Mid-edit             | PARTIAL  | N     | Restore prompt    | N
Sign-off              | Without PIN          | Y        | N     | Blocked           | Y
Audio retention       | Not deleted per pol. | N←CRIT   | N     | Silent PDPA risk  | N←CRIT
```

---

## Pilot Validation Plan

| Stage | What you're validating | Method | Success criteria |
|---|---|---|---|
| Week 1–2 | Consent flow comfort | Show mockup to 3 physicians + ask patients | Physician willing to ask; patient comfort >80% |
| Week 2–4 | Note schema correctness | Wizard of Oz: manually structure 20 consultations | Physician approves >18/20 |
| Week 4–6 | Whisper accuracy on TCM zh-CN | Benchmark on 30 min real audio | Herb name accuracy >95%, general >90% |
| Week 6–8 | Diarisation accuracy | Run same audio through pyannote | Correct speaker attribution >85% |
| Week 8–12 | Full automated prototype | 2 physicians, daily use | 4/5 using daily after week 3 |

---

## Performance Targets

| Codepath | Target | Acceptable max |
|---|---|---|
| Whisper (25 min, CPU-only) | 5 min | 8 min |
| Pyannote diarisation | 2 min | 4 min |
| LLM structuring (private server) | 10s | 20s |
| Total: end of consultation → note ready | 8 min | 12 min |
| Time to signed note (key product metric) | < 5 min physician time | 10 min |

**Hardware floor:** Intel i5 8th gen+, 16GB RAM. GPU recommended (reduces wait from ~8 min to ~90s) but not required.

---

## TODO.md

| # | Item | Priority | Effort | Blocks |
|---|---|---|---|---|
| 1 | Schedule HSA pre-submission consultation (SaMD classification) | P1 | S | Public launch |
| 2 | Source and curate herb dosage range table (top 300 herbs, 中国药典) | P1 | M | Prescription safety |
| 3 | Design and test de-identification layer for Chinese text (names, NRIC, phone) | P1 | M | Any API call with transcript |
| 4 | Validate note schema with 2–3 more TCM physicians | P1 | S | Schema finalisation |
| 5 | Evaluate and license TCM herb database (names zh-CN/zh-TW/pinyin/Latin + dosages) | P1 | M | Prescription section build |
| 6 | Benchmark Whisper + pyannote on real consultation audio (30 min, with consent) | P1 | S | Architecture confirmation |
| 7 | Evaluate Tauri vs Electron for cross-platform (iPad v2 implications) | P2 | S | Nothing immediately; shapes v2 |

---

## NOT In Scope (v1)

| Item | Rationale |
|---|---|
| Feature 2: Patient Record analytics | Build on v1 data; premature without validated schema |
| Feature 3: RAG / literature reference | Needs TCM corpus curation; not needed to prove scribe value |
| Feature 4: Treatment Guidance | SaMD boundary risk; defer until regulatory clarity |
| iPad native app | Requires separate codebase; Windows desktop first |
| China market | NMPA requires separate regulatory strategy |
| Malaysia market | Dilutes focus; Singapore first |
| Billing/insurance integration | Different buyer, different problem |
| Telemedicine features | Different infrastructure category |
| Prescription dispensary integration | Involves pharmacists, separate regulatory domain |
| Real-time streaming transcription | Post-session is sufficient for v1; real-time adds complexity |

---

## Dream State Delta

```
THIS PLAN DELIVERS                       12-MONTH IDEAL STILL NEEDS
────────────────────────────────────     ────────────────────────────────────
Working scribe for solo practitioners    Schema validated by 10+ physicians
PDPA-compliant local audio processing    Formal HSA pre-submission completed
Private LLM, SG data residency          TCM audio corpus (500+ hrs) for fine-tuning
Configurable note template              Feature 2 (longitudinal patient records)
Herb DB autocomplete (zero LLM Rx)      Herb dosage range validation table
Consent flow baked in                   Clinical advisor formally on retainer
Zero-herb-error architecture            Chinese-dialect (Hokkien/Cantonese) handling
```
