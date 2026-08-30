# HSA Pre-Submission Consultation — What It Is and What to Do

## What Is HSA?

HSA stands for **Health Sciences Authority** — Singapore's government body that
regulates health products, including medical software. They decide whether a
piece of software needs to be treated like a medical device (with all the
compliance that entails) or whether it's just a regular productivity tool.

---

## What Is SaMD?

SaMD stands for **Software as a Medical Device**.

The key question HSA asks is:

> *Does this software make, suggest, or assist a clinical decision
> that could directly affect a patient's safety — without a doctor
> reviewing and approving the output first?*

**If YES → SaMD.** Needs registration, quality management, clinical evidence.
Takes 6–18 months and significant cost.

**If NO → Not SaMD.** Can launch without HSA registration.

---

## Where Does Our Product Sit?

Here is the honest picture for each feature:

```
FEATURE                          LIKELY CLASSIFICATION    REASON
─────────────────────────────────────────────────────────────────────
Consultation Scribe              NOT SaMD (almost certain) It's a scribe.
(Feature 1 — what we're          The physician reviews     No AI
building now)                    and signs off everything. makes decisions.

Patient Records (Feature 2)      NOT SaMD                  Storage only.
                                                           No inference.

TCM Literature RAG (Feature 3)   BORDERLINE                Depends on how
                                                           it's presented.
                                                           "Here is a passage
                                                           from a book" = ok.
                                                           "This is relevant
                                                           to your patient" =
                                                           may cross the line.

Treatment Guidance (Feature 4)   LIKELY SaMD               AI suggesting
                                                           clinical actions
                                                           = decision support.
```

**For Feature 1 (our current scope): we believe it's NOT SaMD.**
But we want HSA to confirm this before we launch, not after.

---

## What Is the Pre-Submission Consultation?

It's a **free service** HSA provides for companies that aren't sure whether
their product needs to be registered.

- You describe your product in writing
- HSA reviews it and gives you their informal opinion
- Takes 2–4 weeks to get a response
- No fees
- No commitment — it's just a conversation
- Does NOT constitute formal regulatory approval, but gives you
  a strong signal before you invest further

Think of it like calling a lawyer for a 30-minute consult before
deciding whether to proceed with a case.

---

## What Happens If We Don't Do This?

If we launch without checking and HSA later decides the product IS a
medical device, we would need to:
- Take the product down
- Register it (6–18 months process)
- Potentially face enforcement action

The cost of a 20-minute consultation now vs. the cost of that scenario
later is not a difficult calculation.

---

## The Email to Send

Send this to: medicaldevices_consult@hsa.gov.sg

---

**Subject:** Pre-Submission Consultation Request — AI-Assisted TCM Consultation
Documentation Software

Dear HSA Medical Devices Branch,

I am writing to request a pre-submission consultation regarding the SaMD
classification of a software product currently in development.

**Company / Developer:** [Your name / company name]
**Contact:** [Your email and phone]
**Intended Market:** Singapore (primary), Malaysia (future)

---

**Product Description:**

We are developing a desktop application for use by licensed Traditional
Chinese Medicine (TCM) practitioners in Singapore. The application assists
physicians with consultation documentation only.

**Core function (v1):**

The application records audio of a TCM consultation (with patient consent),
transcribes it using local speech recognition, and structures the transcript
into a TCM-format clinical note covering: chief complaint, systems review,
tongue and pulse observations, pattern identification, treatment principle,
and prescription.

**Key design principles:**
- All AI-generated content is presented as an editable draft only
- The physician must review, edit, and explicitly approve (PIN sign-off)
  every note before it is saved as a clinical record
- Pattern identification and treatment principle fields are physician-entered
  only — the AI does not populate these fields under any circumstances
- The prescription section uses a validated herb database with
  physician-confirmed selection — AI does not generate or suggest herbs
- All outputs are clearly labelled as AI-assisted drafts, not clinical advice
- The tool produces no diagnostic output and makes no clinical inferences

**What the software does NOT do:**
- Does not diagnose
- Does not suggest treatments or herbs
- Does not interpret clinical findings
- Does not override or bypass physician judgment at any stage

**Regulatory question:**

We believe this product falls outside the SaMD classification threshold
as it functions as a documentation and organisation tool with no clinical
decision-making capability, and with mandatory physician review and
attestation for every output.

We would appreciate HSA's informal view on whether this product description
triggers SaMD classification under the Medical Devices Act, and if so,
which risk class would likely apply.

We are happy to provide additional documentation, a product demo, or attend
a meeting at your convenience.

Thank you for your time.

Yours sincerely,
[Your name]
[Company / project name]
[Contact details]

---

## After You Send It

- Keep a copy of the email with the date sent
- HSA typically responds within 2–4 weeks
- They may ask follow-up questions about specific features
- If they say "not SaMD for Feature 1" — you have a green light to launch
- If they say "borderline" or "needs more info" — come back and we will
  adjust the product description or feature set accordingly

---

## One Important Note

The email above describes Feature 1 only (the scribe).
When you add Feature 3 (literature RAG) or Feature 4 (treatment guidance),
you will need to consult HSA again. Do not describe future features
in this first consultation — keep it scoped to what you are actually
building right now.
