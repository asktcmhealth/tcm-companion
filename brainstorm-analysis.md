# TCM Physician AI Companion — Product Brainstorm Analysis

*Generated: 2026-05-17. This is a strategic analysis document, not a technical spec.*

---

## Step 1: Market & Problem Validation

### Who exactly is the target user?

There are three meaningfully different customer profiles, and they should not be treated as one:

**Profile A: Solo TCM Practitioner (Singapore/Malaysia)**
- Runs a 1–2 room clinic, sees 15–30 patients/day
- Does all documentation themselves, often after hours
- Makes all clinical and business decisions
- WTP: Moderate. Will pay if ROI is obvious and immediate. Price-sensitive.
- Acquisition: Word of mouth, professional associations (TCMPB in Singapore)

**Profile B: TCM Physician in Integrated Clinic (e.g., Thomson Chinese Medicine, Eu Yan Sang clinics)**
- Works in a structured environment with existing workflows and some admin support
- May have basic clinic management software already
- Procurement is at clinic/chain level, not individual
- WTP: Higher, but sales cycle is longer and involves non-clinical stakeholders
- Acquisition: Enterprise sales motion

**Profile C: TCM Department in a Hospital (e.g., Singapore General Hospital TCM dept, China hospital)**
- Highest regulatory scrutiny, longest procurement cycle
- Offers validation and credibility if you land them
- Not a v1 target — too slow, too complex

**Recommended initial focus: Profile A.** Fastest feedback loop, clearest pain, decision-maker is the user.

---

### Current Workflow & Friction Points

A typical solo practitioner consultation in Singapore looks roughly like this:

1. Patient arrives → practitioner reviews previous handwritten or typed notes (2–5 min)
2. Consultation: chief complaint, questions, tongue/pulse examination (15–25 min)
3. Pattern identification and treatment principle formed mentally or noted briefly
4. Prescription written on paper or typed into a basic system (5–10 min)
5. Post-consultation: full note written up, often at end of day (5–15 min per patient)

**Largest friction points, in order:**
1. Post-consultation documentation — universally disliked, time-consuming, error-prone when done from memory at day's end
2. Cross-referencing classical texts — mostly done from memory or via printed reference books; online search is slow and not TCM-structured
3. Tracking patient progression — many practitioners use paper; pattern evolution over time is hard to surface
4. Prescription legibility and accuracy — herb names handwritten → dispensary errors possible

**What tools do they use today?**

- Singapore/Malaysia: Largely paper + Microsoft Word/Excel, some use generic clinic management software (e.g., Clinic Assistant, MedLink) which are Western-medicine-first
- China: More digitised — some use TCM-specific EHR systems (e.g., 医惠, 金算盘), which are transactional but not AI-assisted
- Classical text reference: Physical books, some use apps like 中医世家 (a basic herb/formula database), or simply search Baidu

**Why existing tools are insufficient:**
- Generic clinic software has no TCM vocabulary, no 四诊 (four examinations) schema, no pattern diagnosis fields
- Reference apps are lookup tools — they don't surface contextually during a consultation
- Nothing structures unstructured consultation audio into a TCM clinical note

**Assumption to validate:** Do practitioners actually want to record audio of consultations? Some may have concerns about patient comfort or data liability. This needs direct interview validation before you build transcription.

---

### Willingness to Pay

Singapore TCM practitioners are licensed and generally earn SGD 60–150/consultation. A busy solo practitioner doing 20 patients/day grosses SGD 1,200–3,000/day. Software that saves 30 minutes/day at that earnings rate is worth SGD 200+/month to them economically. The question is whether they perceive it that way.

**Assumption to validate:** Price anchoring. What do they currently pay for software? Many pay SGD 0–50/month for existing tools. Getting to SGD 100–200/month requires demonstrated ROI, not just feature value.

**Comparable markets:** Dentists and physiotherapists in Singapore have moved to practice management software at SGD 100–300/month. TCM is likely 2–3 years behind that adoption curve.

---

### Sharp Questions Before Proceeding

1. Have you sat in on at least 3 consultations with solo TCM practitioners and timed their documentation workflow? What you assume takes 10 minutes may take 2, or 30.
2. What percentage of TCM practitioners in Singapore already record consultations (audio or video) for any purpose? If it's near zero, audio transcription requires a behaviour change, not just a tool.
3. Is the bottleneck documentation time, or is it recall accuracy when documenting from memory hours later? These imply different product designs.

---

## Step 2: Product Scope Definition

### What is the minimum viable version?

**MVP: TCM Consultation Scribe**

A tool that does exactly one thing well: converts a consultation (audio or manual input) into a structured TCM clinical note, which the physician reviews, edits, and approves.

Nothing else. No literature retrieval. No treatment guidance. No fancy patient history analytics.

The reason this is the right MVP:
- It solves the #1 pain point (documentation)
- It requires no clinical inference — it's a structured scribe
- It is almost certainly outside SaMD classification if scoped correctly
- It creates the data asset (structured notes) that every subsequent feature depends on
- Physician trust is built on small, reliable wins — this is the easiest win

---

### Feature Priority

| Priority | Feature | Rationale |
|---|---|---|
| 1 | Consultation Transcription + TCM Note Structuring | Clearest pain, lowest regulatory risk, fastest to demonstrate value |
| 2 | Patient Record Organisation | Creates retention and switching costs; builds on notes from Feature 1 |
| 3 | TCM Literature Reference (RAG) | Adds reference value; needs careful hallucination guardrails |
| 4 | Treatment Guidance | Highest value ceiling but highest risk — do not build until RAG is trusted |

---

### What Is Scope Creep at This Stage

- **Billing and insurance integration** — different problem, different buyer
- **Prescription dispensary integration** — complex, involves pharmacists and regulatory compliance
- **Telemedicine features** — different infrastructure, different regulatory category
- **Treatment Guidance (Feature 4)** — even though it's in the original spec, it's scope creep for v1. It belongs in v2 after you have physician trust and a validated RAG system.
- **China market support** — valid market but requires separate regulatory strategy (NMPA), simplified Chinese corpus, different cloud infrastructure. Do not dilute focus.

---

### Sharp Questions Before Proceeding

1. If the transcription feature saved a physician 20 minutes/day but occasionally missed a herb name or mislabelled a pulse quality, would they still use it? Where is their tolerance threshold for error?
2. Can the structured note from Feature 1 be designed such that Feature 3 (RAG) and Feature 4 (Treatment Guidance) can plug in later without a schema redesign?
3. Is the MVP truly the scribe, or is it the patient record? (Some practitioners may value history tracking over note generation — only interviews will tell you.)

---

## Step 3: Technical Architecture Brainstorm

### AI/ML Components Required

**1. Automatic Speech Recognition (ASR)**
- The hardest technical problem in this product.
- Consultations are bilingual (Mandarin + English), code-switching mid-sentence.
- TCM terminology is highly specialised: herb names (e.g., 黄芪, 柴胡), pulse qualities (弦脉, 滑脉), pattern names (肝郁气滞, 脾虚湿盛).
- Generic Whisper or Azure/Google ASR will have high error rates on TCM vocabulary.
- **Recommended approach:** Whisper large-v3 as base, fine-tuned on a TCM audio corpus, with a custom post-processing vocabulary layer for herb and formula names.
- **Risk:** Building a TCM audio corpus for fine-tuning is non-trivial. You need either recorded consultations (with consent) or synthetic data.
- **Alternative:** Start with manual input (physician types or dictates), generate the structured note, and add ASR in v2 once you have a corpus.

**2. Note Structuring (LLM)**
- Given a transcript or manual input, extract and structure into TCM SOAP schema.
- This is well within current LLM capability if the schema is well-defined and prompting is precise.
- Use Claude (Anthropic) or GPT-4o with a carefully engineered system prompt and schema.
- Key consideration: The output must be deterministic enough that physicians feel it reliably represents what they said — not creative, not interpretive.
- **Recommended:** Structured output (JSON schema) with LLM, then render into human-readable note. Store both.

**3. RAG for Literature Reference (Feature 3)**
- Corpus: Classical texts (黄帝内经, 神农本草经, 伤寒论, 金匮要略) are public domain. Digital versions exist in varying quality.
- Modern clinical guidelines (中医诊疗指南) are published by the China Association of Chinese Medicine — access and licensing need investigation.
- Chunking strategy is non-trivial for classical Chinese: sentences are short, context spans paragraphs. Chunk by commentary unit, not character count.
- Embedding: A Chinese-language embedding model (e.g., text-embedding-3-large, or a fine-tuned model on medical Chinese text) will outperform generic embeddings.
- Vector store: pgvector (PostgreSQL extension) is a strong choice — avoids another managed service, keeps data on-premise if needed.
- **Critical design decision:** Surface the original classical text, never a paraphrase. LLM-generated summaries of classical texts introduce hallucination risk at the point of highest consequence.

**4. Deployment Architecture Options**

| Model | Pros | Cons |
|---|---|---|
| Full SaaS (cloud-hosted) | Easiest to maintain, update, iterate | Patient data leaves clinic; PDPA complexity; physician trust barrier |
| Full On-Premise | Maximum data sovereignty; easiest physician trust conversation | Expensive to deploy/support; can't push updates easily; limited compute |
| Hybrid (local compute + private API) | Transcription/sensitive data processed locally; LLM calls to private API endpoint | More complex; requires stable internet for inference |
| Local LLM (e.g., Ollama + local model) | Complete data sovereignty | Current local models are weaker on TCM Chinese; hardware requirements; no easy updates |

**Recommended for v1:** Hybrid. Run ASR locally (Whisper can run on a laptop GPU). Send transcript (not audio) to a private cloud LLM endpoint for structuring. Patient data never leaves the clinic in audio form. Transcript is de-identified before API call. This is defensible from a PDPA perspective and manageable technically.

---

### Data Requirements

**TCM Corpus (for RAG):**
- Classical texts: Available in digital form (CTEXT database, various GitHub repositories). Quality varies. Will need cleaning, segmentation, and annotation.
- Modern guidelines: Licensing required. Contact China Association of Chinese Medicine (中华中医药学会).
- Formula database: 方剂数据库 — public versions exist; commercial versions (e.g., from academic publishers) are more complete.
- Herb-herb interaction data: Limited in classical literature; modern pharmacological data is mostly in Chinese academic journals.

**Patient Records Schema (minimum viable):**
```
Patient: {id, demographics, consent_status}
Consultation: {date, chief_complaint, four_examinations: {望,闻,问,切}, 
               pattern_identification[], treatment_principle, 
               prescription: {herb[], formula[], modifications[]},
               follow_up_notes}
```
This schema must be designed with forward compatibility for Features 3 and 4.

**Existing APIs/Models That Accelerate Development:**
- ASR: Whisper API (OpenAI) or Azure Cognitive Services (has Mandarin support)
- LLM: Claude claude-sonnet-4-6 via Anthropic API — best for structured output and following complex schemas
- Embeddings: OpenAI text-embedding-3-large or Cohere multilingual embeddings
- Vector DB: pgvector on PostgreSQL (self-hosted), or Qdrant (on-premise friendly)

---

### Sharp Questions Before Proceeding

1. Is there a practitioner willing to give you 20 hours of consented consultation recordings for ASR training and product testing? Without this, you are building ASR blind.
2. What is the minimum viable TCM corpus? The full 黄帝内经 is 80,000+ characters. Do you need all of it for a first RAG implementation, or can you start with the 金匮要略 (more clinically specific) and expand?
3. Have you evaluated whether a local Whisper model (running on a mid-range laptop) achieves acceptable accuracy on Mandarin TCM terminology before you commit to the transcription-first approach?

---

## Step 4: Risk & Regulatory Assessment

### Singapore Regulatory Framework

Singapore's Health Sciences Authority (HSA) regulates Software as a Medical Device (SaMD) under the Medical Devices Act, aligned with the IMDRF SaMD framework.

**The key classification question:** Does the software *inform, drive, or assist* a clinical decision that could directly affect patient safety, without a human clinical review in the loop?

| Your Feature | Likely Classification | Reasoning |
|---|---|---|
| Transcription + Note Structuring | Not SaMD | Scribe function; physician reviews and approves all output |
| Patient Record Organisation | Not SaMD | Storage and retrieval only; no inference |
| Literature RAG (passive retrieval) | Borderline | Surfacing a text passage = library. Contextualising it to patient = borderline DSS |
| Treatment Guidance | Likely SaMD Class B or higher | Suggesting clinical action based on patient data = clinical decision support |

**Class B SaMD** (HSA terminology) requires: QMS, software lifecycle documentation, post-market surveillance, HSA product listing. This is not insurmountable but adds 6–12 months and significant compliance overhead.

**The line to stay below:** Your product description and user interface must not claim or imply that the AI is making, suggesting, or assisting a clinical decision. "Here is what you said during the consultation, structured" is not SaMD. "Based on this patient's pattern, consider 柴胡疏肝散" is.

**Practical action:** Before launch, engage a Singapore regulatory consultant to review your product description, UI copy, and feature set. This is a SGD 5,000–15,000 investment that is worth making before you have users.

---

### Malaysia (NPRA) and China (NMPA)

- **Malaysia:** National Pharmaceutical Regulatory Agency (NPRA) has a SaMD framework modelled on IMDRF but enforcement is lighter at this stage. Singapore-first strategy is sound.
- **China:** National Medical Products Administration (NMPA) published specific AI Medical Device guidelines in 2021. China is the most stringent and the largest market. Requires separate regulatory filing, local data residency, and likely a local entity or partnership. This is a 12–24 month additional effort. Do not include in v1 scope.

---

### PDPA Compliance (Singapore)

Key obligations under Singapore's Personal Data Protection Act 2012:
- **Purpose limitation:** Patient data collected for consultation notes may only be used for that purpose — not for model training without explicit consent.
- **Data transfer overseas:** If LLM inference runs on a US-based API, patient data (including transcripts) technically leaves Singapore. This requires a data transfer impact assessment and appropriate safeguards.
- **Breach notification:** Mandatory reporting to PDPC within 3 business days of a data breach affecting 500+ individuals.
- **Retention:** Data must not be kept longer than necessary for the purpose.

**Mitigation:** The hybrid architecture described in Step 3 (audio processed locally, de-identified transcript sent to API) significantly reduces PDPA exposure. Explicitly design the system so that personally identifiable information (name, NRIC, contact) is never included in API calls.

---

### Hallucination Risk in TCM Context

**Specific failure modes to design against:**

1. **Herb name errors in transcription** — 黄芪 (Huangqi) vs 黄连 (Huanglian) sound different but a low-confidence ASR could confuse them. These are radically different herbs. Mitigation: always show confidence score on herb names; require explicit physician confirmation for any prescription-related field.

2. **False citation in RAG** — LLM generates a plausible-sounding classical text reference that doesn't exist, or misattributes a passage. Mitigation: never generate citations; only surface exact retrieved text with source metadata.

3. **Pattern identification hallucination** — If the LLM is asked to identify a pattern from examination findings, it may generate a plausible but incorrect pattern. Mitigation: do not ask the LLM to identify patterns in v1. Only ask it to structure what the physician said.

4. **Dosage transcription errors** — "三钱" vs "五钱" (3 vs 5 qian) is a clinically significant difference. Mitigation: flag all numeric quantities for explicit physician confirmation before saving.

---

### Liability

- Make the physician the explicit approver of every output before it becomes a clinical record.
- Terms of service must clearly state the tool is a productivity aid, not a clinical decision support tool.
- Never store an AI-generated output as a clinical record without physician attestation.
- Consider a "physician sign-off" UX pattern (explicit confirmation button, not passive acceptance) for every consultation note.

---

### Sharp Questions Before Proceeding

1. Have you had an informal conversation with HSA's pre-submission consultation service? They offer this for free and will tell you directly whether your product description triggers SaMD classification.
2. What is your data residency decision? If patient data must stay in Singapore, you need either a Singapore-region cloud deployment (AWS ap-southeast-1, Azure Southeast Asia) or on-premise. Have you costed this?
3. What is the error rate you are willing to accept in transcription, and what is the physician's? These may be different numbers, and the physician's number governs.

---

## Step 5: Differentiation & Moat

### Existing Competitors

| Product | What it does | Where it falls short for TCM |
|---|---|---|
| Nabla / Suki / Nuance DAX | Medical consultation transcription + note structuring | English-only or Western medicine schema; no TCM vocabulary or clinical logic |
| 医惠 / 金算盘 (China) | TCM clinic management software | Transactional only; no AI; limited to Chinese market; no bilingual support |
| 中医世家 app | TCM reference app (herb/formula lookup) | Static database; no contextual retrieval; no note integration |
| Generic EHR (HealthHub, Clinic Assistant SG) | Practice management | Western medicine schema; no TCM four examinations structure |
| ChatGPT / Claude (direct use) | General LLM | No TCM-specific schema, no integration, no data persistence, PDPA concerns |

**There is no direct competitor in the Singapore/Malaysia market** for an AI-assisted TCM consultation scribe with bilingual support and TCM-native schema. This is a real gap.

---

### What Would Make This Defensible

**Short-term (0–18 months):**
- TCM-native note schema, built in consultation with practising physicians — this becomes the de facto standard if you land enough users
- Bilingual (Mandarin + English) as a first-class design principle, not an afterthought
- Physician trust built through clinical accuracy and data privacy — this is a relationship moat

**Medium-term (18–36 months):**
- Proprietary TCM consultation dataset — every consented consultation structured note is training data you and only you have
- Fine-tuned ASR model on TCM vocabulary — technically superior to generic models
- Network effects if clinic chains standardise on your platform

**Long-term:**
- Longitudinal patient data across your clinic network creates pattern-outcome data that no competitor can replicate
- If you can show "patients with Pattern X who received Formula Y had better outcomes" — that's a research-grade dataset

---

### The Unfair Advantage Question

This product requires three things simultaneously that are hard to combine:
1. Deep TCM domain knowledge (rare in tech)
2. Clinical workflow empathy (requires time with practitioners)
3. AI/ML technical execution

Most TCM domain experts are not builders. Most builders don't have TCM domain expertise. If you are (or are closely partnered with) someone who has genuine depth in both, that's the core unfair advantage.

**Assumption to validate:** What is the founder's actual TCM domain knowledge? If it's surface-level, the first 50 hours of this project should be spent with practicing TCM physicians, not writing code.

---

### Sharp Questions Before Proceeding

1. Who is on your team who has deep TCM clinical knowledge? Not familiarity — deep knowledge. If no one, who is your clinical advisor, and how are they compensated for their time?
2. Can you get 5 TCM practitioners to agree to a structured interview this month? These interviews are worth more than any market research report.
3. What is your data strategy for consent? If your core moat is proprietary consultation data, you need to design consent into the product architecture from day one.

---

## Step 6: Go-To-Market Hypothesis

### How Does a TCM Physician First Hear About This?

TCM practitioners in Singapore are not hunting for SaaS tools. They are not reading Product Hunt or attending tech conferences. The channels that reach them:

1. **Professional associations:** The Traditional Chinese Medicine Practitioners Board (TCMPB) and Singapore Chung Hwa Medical Institution have member networks. An endorsement or even a mention from these bodies is high-trust signal.
2. **Peer referral:** TCM is a community with strong word of mouth. One respected senior practitioner using your tool and recommending it is worth more than any digital ad campaign.
3. **Continuing education events:** TCM CPD (continuing professional development) sessions are attended regularly. A product demo at a CPD event reaches the right people in the right mindset.
4. **Chinese-language media:** Lianhe Zaobao (联合早报) health sections, Chinese-language health influencers on Xiaohongshu/WeChat — practitioners read these.

---

### Sales Motion

**v1: Founder-led, direct to solo practitioners**

- You (the founder) personally onboard the first 10 users
- No self-serve until you understand exactly where the friction is in setup, daily use, and data privacy concerns
- Pricing: Free for the first 10 beta users in exchange for weekly feedback sessions
- Success metric: Daily active use after week 3 (not initial sign-up)

**v2: Clinic chain expansion**
- Once you have 10 happy solo practitioners, one of them probably has a referral to a small clinic chain
- Clinic chains (3–10 practitioners) justify a higher ACV and reduce per-customer support cost
- Sales cycle is longer (2–3 months) but contract value is 3–5x

**Not now:** MOH partnerships, hospital TCM departments, China market. These are real but they require regulatory credentials, enterprise sales capability, and localisation work you shouldn't attempt until v1 is proven.

---

### What Does a Pilot Program Look Like?

**Phase 1: Observation (4 weeks, before you write a line of code)**
- Sit in on 5–8 consultations with 3 different practitioners (with consent)
- Map the exact workflow, time each step, note every friction point
- Interview practitioners about what "perfect" would look like

**Phase 2: Manual Prototype (4–6 weeks)**
- Build the absolute simplest version: physician records audio on their phone, you manually transcribe and structure into a TCM note, email it back within 2 hours
- This is a Wizard of Oz prototype — no AI at all
- Goal: validate that practitioners will (a) record consultations and (b) find structured notes useful

**Phase 3: Automated v1 (8–12 weeks)**
- Replace the manual step with automated transcription + LLM structuring
- Deploy to 5 willing practitioners
- Measure: time saved per consultation, physician satisfaction with note quality, error rate on herb names

**Success criteria for pilot completion:** 4 of 5 practitioners are using the tool daily after 4 weeks of access, and at least 2 say they would pay for it.

---

### Sharp Questions Before Proceeding

1. Do you have 3 TCM practitioners you can contact this week to begin the observation phase? If not, how do you get access to them?
2. What is the minimum data privacy setup that would make a practitioner comfortable recording a consultation? Do you need a signed data processing agreement before the Wizard of Oz phase?
3. What does "daily use" actually mean in a TCM practice context? One consultation per day in a solo practice vs. 30 in a busy clinic are very different activation thresholds.

---

## Summary: What to Do Before Writing Any Code

In priority order:

1. **Conduct 5 practitioner interviews** — Solo practitioners, in Singapore, currently practicing. Ask about documentation workflow, tools used, and attitudes toward recording consultations.

2. **Clarify your TCM domain expertise and clinical advisor situation** — If you don't have deep TCM knowledge on the team, recruiting a clinical advisor is the highest-leverage action you can take right now.

3. **Run a Wizard of Oz prototype** — Get one willing practitioner to record a consultation (with patient consent). You manually transcribe and structure it. See if they find the output useful. This takes days, not weeks, and will tell you more than any architecture decision.

4. **Have an informal conversation with HSA** — Their pre-submission consultation service is free. Describe your MVP feature set and get their initial read on SaMD classification. This removes your biggest regulatory uncertainty cheaply.

5. **Make the data residency decision** — Before you design any technical architecture, decide: does patient data leave Singapore for inference? Your answer shapes every subsequent technical choice.

---

*Next step: /plan-ceo-review — after narrowing scope based on the above.*
