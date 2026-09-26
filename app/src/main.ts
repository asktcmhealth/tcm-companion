import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { t, getLang, setLang, stagePhrases } from "./i18n";

// `ambiguous`/`ambiguous_with` are optional because a sidecar binary built
// before the ambiguity check existed simply doesn't emit them -- treated as
// "not flagged" rather than crashing on a missing field.
interface HerbEntry {
  name: string;
  dosage: number;
  unit: string;
  db_confirmed: boolean;
  dosage_warning: boolean;
  dosage_check_message: string;
  high_risk: boolean;
  ambiguous?: boolean;
  ambiguous_with?: string | null;
}

interface AcupointEntry {
  name: string;
  code: string;
  meridian: string;
  laterality: string | null;
  db_confirmed: boolean;
  ambiguous?: boolean;
  ambiguous_with?: string | null;
}

// Every string interpolated into innerHTML below goes through this. Most come
// from the closed herb/acupoint databases, but the de-identification report
// echoes text lifted straight from the transcript (pasted by the user or
// produced by ASR), which can contain anything.
function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

interface DeidRedaction {
  type: string;
  text: string;
}

interface PipelineResult {
  schema_version: string;
  prescription_spans_found: number;
  acupuncture_spans_found: number;
  correction_edits: { original: string; corrected: string; similarity: number }[];
  prescription: { herbs: HerbEntry[] };
  acupuncture: { points: AcupointEntry[] };
  deid_report: DeidRedaction[];
  consultation_note: string;
  deidentified_transcript: string;
}

// ---------- Patient queue --------------------------------------------------
// Every consultation (recorded, picked from disk, or pasted as text) becomes
// a job here rather than running synchronously. Only one job is ever active
// at a time -- this app runs Whisper large-v3 on CPU on hardware with only
// 8GB RAM (see sidecar_whisper/main.py's comments on why: running it
// concurrently with normal desktop use already crashed the whole system
// once). Recording itself is cheap (just capturing audio), so a physician
// can start the next patient immediately; only the transcription queues.

type JobStatus = "queued" | "transcribing" | "processing" | "done" | "error";

interface PatientJob {
  id: string;
  label: string;
  status: JobStatus;
  audioPath?: string;
  transcript?: string;
  result?: PipelineResult;
  error?: string;
}

const jobs: PatientJob[] = [];
let selectedJobId: string | null = null;
let workerRunning = false;
let patientCounter = 0;

// Tauri rejects invoke() with the plain string the Rust command returned, but
// other failures arrive as Error objects -- String(err) on those yields
// "Error: message", which then gets our own "Error: " prefix stacked on top.
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function makeJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function enqueueJob(partial: Pick<PatientJob, "audioPath" | "transcript">) {
  patientCounter += 1;
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const job: PatientJob = {
    id: makeJobId(),
    label: `${t("patient_word")} ${patientCounter} · ${time}`,
    status: "queued",
    ...partial,
  };
  jobs.push(job);
  // Don't yank the view away from a finished patient the physician may be
  // mid-review on -- the whole point of the queue is starting the next
  // patient without losing your place. Only auto-select when there's nothing
  // useful on screen yet (first job, or the selected one has no result).
  const current = jobs.find((j) => j.id === selectedJobId);
  if (!current || !current.result) {
    selectJob(job.id);
  } else {
    renderPatientList();
  }
  void runQueueWorker();
}

async function runQueueWorker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    for (;;) {
      const next = jobs.find((j) => j.status === "queued");
      if (!next) break;

      if (next.audioPath) {
        next.status = "transcribing";
        renderPatientList();
        if (selectedJobId === next.id) renderSelectedJob();
        startStage(next.label, "transcribing");
        try {
          const raw = await invoke<string>("run_transcribe_and_process", { audioPath: next.audioPath });
          next.result = JSON.parse(raw);
          next.status = "done";
          finishStage(next.label, summarize(next.result!), false);
        } catch (err) {
          next.error = errorText(err);
          next.status = "error";
          finishStage(next.label, `${t("error_prefix")}${errorText(err)}`, true);
        }
      } else if (next.transcript !== undefined) {
        next.status = "processing";
        renderPatientList();
        if (selectedJobId === next.id) renderSelectedJob();
        startStage(next.label, "processing");
        try {
          const raw = await invoke<string>("run_note_pipeline", { transcript: next.transcript });
          next.result = JSON.parse(raw);
          next.status = "done";
          finishStage(next.label, summarize(next.result!), false);
        } catch (err) {
          next.error = errorText(err);
          next.status = "error";
          finishStage(next.label, `${t("error_prefix")}${errorText(err)}`, true);
        }
      }

      renderPatientList();
      if (selectedJobId === next.id) renderSelectedJob();
    }
  } finally {
    workerRunning = false;
  }
}

function summarize(result: PipelineResult): string {
  return t("summary_done")
    .replace("{herbs}", String(result.prescription.herbs.length))
    .replace("{acupoints}", String(result.acupuncture.points.length))
    .replace("{pii}", String(result.deid_report.length));
}

function selectJob(id: string) {
  selectedJobId = id;
  renderPatientList();
  renderSelectedJob();
}

function statusLabel(status: JobStatus): string {
  return t(`status_${status}`);
}

function renderPatientList() {
  const list = document.querySelector<HTMLElement>("#patient-list");
  const emptyEl = document.querySelector<HTMLElement>("#patient-list-empty");
  if (!list) return;

  list.querySelectorAll(".patient-row").forEach((el) => el.remove());
  if (emptyEl) emptyEl.style.display = jobs.length === 0 ? "" : "none";

  for (const job of jobs) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "patient-row" + (job.id === selectedJobId ? " selected" : "");
    button.setAttribute("aria-pressed", String(job.id === selectedJobId));

    const label = document.createElement("span");
    label.className = "patient-label";
    label.textContent = job.label;

    const status = document.createElement("span");
    const statusClass =
      job.status === "done" ? "done" : job.status === "error" ? "error" : job.status === "queued" ? "queued" : "active";
    status.className = `patient-status patient-status-${statusClass}`;
    status.textContent = statusLabel(job.status);

    button.append(label, status);
    button.addEventListener("click", () => selectJob(job.id));
    li.appendChild(button);
    list.appendChild(li);
  }
}

// ---------- Stage panel (honest progress: real stage transitions + elapsed
// time, no fabricated percentage since neither sidecar reports one) --------
// Always reflects whichever job the background worker is CURRENTLY on, not
// whatever the physician has selected to view -- so a completed patient's
// results stay on screen uninterrupted while the next one transcribes.

// Physician-facing status text -- deliberately no model/library names
// (nobody reviewing a consultation note cares that it's "Whisper large-v3"),
// and rotates through a few phrases per stage rather than sitting on one
// static line, so a multi-minute wait feels alive instead of stalled.
// Phrase text itself lives in i18n.ts alongside every other UI string.

let timerHandle: number | undefined;
let phraseRotationHandle: number | undefined;
let currentPhraseSet: string[] = [];
let currentPhraseIndex = 0;
let startedAt = 0;
let currentStageJobLabel = "";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function stageEls() {
  return {
    panel: document.querySelector<HTMLElement>("#stage-panel"),
    text: document.querySelector<HTMLElement>("#stage-text"),
    timer: document.querySelector<HTMLElement>("#stage-timer"),
  };
}

function rotatePhrase() {
  const { text } = stageEls();
  if (!text || currentPhraseSet.length === 0) return;
  currentPhraseIndex = (currentPhraseIndex + 1) % currentPhraseSet.length;
  text.textContent = `${currentStageJobLabel}: ${currentPhraseSet[currentPhraseIndex]}`;
}

function beginPhraseRotation(stageKey: string) {
  const { text } = stageEls();
  window.clearInterval(phraseRotationHandle);
  currentPhraseSet = stageKey === "transcribing" || stageKey === "processing" ? stagePhrases(stageKey) : [stageKey];
  currentPhraseIndex = 0;
  if (text) text.textContent = `${currentStageJobLabel}: ${currentPhraseSet[0]}`;
  phraseRotationHandle = window.setInterval(rotatePhrase, 2800);
}

function startStage(jobLabel: string, stageKey: string) {
  const { panel, timer } = stageEls();
  if (!panel || !timer) return;

  currentStageJobLabel = jobLabel;
  panel.classList.remove("state-error", "state-done");
  panel.classList.add("visible");
  beginPhraseRotation(stageKey);
  startedAt = Date.now();
  timer.textContent = "0:00";

  window.clearInterval(timerHandle);
  timerHandle = window.setInterval(() => {
    timer.textContent = formatElapsed(Date.now() - startedAt);
  }, 1000);
}

function finishStage(jobLabel: string, label: string, isError: boolean) {
  const { panel, text } = stageEls();
  window.clearInterval(timerHandle);
  window.clearInterval(phraseRotationHandle);
  if (!panel || !text) return;
  panel.classList.add(isError ? "state-error" : "state-done");
  text.textContent = `${jobLabel}: ${label}`;
}

listen<string>("pipeline-stage", (event) => {
  beginPhraseRotation(event.payload);
});

// ---------- Result rendering ----------

// The "verify" flag comes from the correction engine's ambiguity check: a
// different real herb/acupoint scored almost as well against the same span of
// audio, so the transcript alone can't say which was actually spoken. It is a
// speech-recognition caveat, NOT a clinical suggestion -- the wording points
// the physician back to the recording and never recommends either option.
function verifyNote(alt: string | null | undefined): string {
  return t("verify_note").replace("{alt}", esc(alt ?? "?"));
}

// One glanceable line above the list so a flagged row isn't missed while
// scrolling: how many entries need a human look before sign-off.
function reviewBanner(parts: string[]): string {
  if (parts.length === 0) return "";
  return `<p class="review-banner" role="note"><strong>${t("review_banner")}</strong> ${parts.join(" · ")}</p>`;
}

function countPart(key: string, n: number): string {
  return n > 0 ? t(key).replace("{n}", String(n)) : "";
}

function renderPrescription(herbs: HerbEntry[], sectionFound: boolean): string {
  // An empty list has two very different meanings. If no "处方" trigger was
  // recognized nothing was even searched -- the physician must not read that as
  // "nothing was prescribed".
  if (herbs.length === 0) {
    return `<span class="empty-state">${t(sectionFound ? "empty_no_herbs" : "empty_no_prescription")}</span>`;
  }

  const banner = reviewBanner(
    [
      countPart("review_part_verify", herbs.filter((h) => h.ambiguous).length),
      countPart("review_part_range", herbs.filter((h) => h.dosage_warning).length),
      countPart("review_part_risk", herbs.filter((h) => h.high_risk).length),
    ].filter(Boolean),
  );

  const rows = herbs
    .map((h) => {
      const badges: string[] = [];
      if (h.ambiguous) badges.push(`<span class="badge badge-verify">${t("badge_verify")}</span>`);
      if (h.high_risk) badges.push(`<span class="badge badge-high-risk">${t("badge_high_risk")}</span>`);
      if (h.dosage_warning) badges.push(`<span class="badge badge-out-of-range">${esc(h.dosage_check_message)}</span>`);
      return `<li class="entry-row${h.ambiguous ? " entry-row-verify" : ""}">
        <span class="entry-main">${esc(h.name)} <span class="entry-meta">${esc(h.dosage)}${esc(h.unit)}</span></span>
        <span class="entry-badges">${badges.join("")}</span>
        ${h.ambiguous ? `<span class="entry-note">${verifyNote(h.ambiguous_with)}</span>` : ""}
      </li>`;
    })
    .join("");
  return `${banner}<ul class="entry-list">${rows}</ul>`;
}

function renderAcupuncture(points: AcupointEntry[]): string {
  if (points.length === 0) return `<span class="empty-state">${t("empty_no_acupoints")}</span>`;

  const banner = reviewBanner(
    [countPart("review_part_verify", points.filter((p) => p.ambiguous).length)].filter(Boolean),
  );

  const rows = points
    .map((p) => {
      const lat = p.laterality ? ` (${esc(p.laterality)})` : "";
      return `<li class="entry-row${p.ambiguous ? " entry-row-verify" : ""}">
        <span class="entry-main">${esc(p.name)}${lat}</span>
        <span class="entry-badges">${p.ambiguous ? `<span class="badge badge-verify">${t("badge_verify")}</span>` : ""}</span>
        <span class="entry-meta">${esc(p.code)} · ${esc(p.meridian)}</span>
        ${p.ambiguous ? `<span class="entry-note">${verifyNote(p.ambiguous_with)}</span>` : ""}
      </li>`;
    })
    .join("");
  return `${banner}<ul class="entry-list">${rows}</ul>`;
}

function renderDeid(report: DeidRedaction[]): string {
  if (report.length === 0) return `<span class="empty-state">${t("empty_no_pii")}</span>`;
  const rows = report
    .map((r) => `<li class="deid-chip"><span class="deid-type">${esc(r.type)}</span>${esc(r.text)}</li>`)
    .join("");
  return `<ul class="deid-list">${rows}</ul>`;
}

// Shown in place of results whenever the selected patient has none yet. An
// errored job used to render nothing at all -- its error text lived only in
// the transient stage bar and was overwritten as soon as the next job began,
// leaving a dead row with no explanation (a real risk here: transcription is
// memory-hungry on 8GB machines and can genuinely fail).
function renderJobStatus(job: PatientJob | undefined) {
  const card = document.querySelector<HTMLElement>("#job-status");
  const text = document.querySelector<HTMLElement>("#job-status-text");
  const retry = document.querySelector<HTMLButtonElement>("#job-retry");
  if (!card || !text || !retry) return;

  if (!job || job.result) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  const isError = job.status === "error";
  card.classList.toggle("state-error", isError);
  text.textContent = isError
    ? `${t("error_prefix")}${job.error ?? ""}`
    : job.status === "queued"
      ? t("job_queued_msg")
      : t("job_active_msg");
  retry.hidden = !isError;
}

function retrySelectedJob() {
  const job = jobs.find((j) => j.id === selectedJobId);
  if (!job || job.status !== "error") return;
  job.status = "queued";
  job.error = undefined;
  renderPatientList();
  renderSelectedJob();
  void runQueueWorker();
}

function renderSelectedJob() {
  const panel = document.querySelector<HTMLElement>("#results-panel");
  const noteEl = document.querySelector<HTMLElement>("#consultation-note-output");
  const prescriptionEl = document.querySelector<HTMLElement>("#prescription-output");
  const acupunctureEl = document.querySelector<HTMLElement>("#acupuncture-output");
  const deidEl = document.querySelector<HTMLElement>("#deid-output");
  const rawEl = document.querySelector<HTMLElement>("#raw-output");
  if (!panel || !noteEl || !prescriptionEl || !acupunctureEl || !deidEl || !rawEl) return;

  const job = jobs.find((j) => j.id === selectedJobId);
  renderJobStatus(job);
  if (!job || !job.result) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const result = job.result;
  noteEl.textContent = result.consultation_note || t("empty_note");
  prescriptionEl.innerHTML = renderPrescription(result.prescription.herbs, result.prescription_spans_found > 0);
  acupunctureEl.innerHTML = renderAcupuncture(result.acupuncture.points);
  deidEl.innerHTML = renderDeid(result.deid_report);
  rawEl.textContent = JSON.stringify(result, null, 2);
}

// ---------- Input: paste transcript ----------

async function queuePastedText() {
  const input = document.querySelector<HTMLTextAreaElement>("#transcript-input");
  if (!input) return;

  const transcript = input.value.trim();
  if (!transcript) return;

  enqueueJob({ transcript });
  input.value = "";
}

// ---------- Input: choose audio file ----------

async function pickAndQueueAudio() {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Audio", extensions: ["m4a", "mp3", "wav", "mp4", "webm"] }],
  });
  if (!selected) return;

  const audioPath = Array.isArray(selected) ? selected[0] : selected;
  enqueueJob({ audioPath });
}

// ---------- Input: record audio ----------

const RECORD_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickRecordMimeType(): string {
  for (const type of RECORD_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  return "webm";
}

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordTimerHandle: number | undefined;
let recordStartedAt = 0;

// Real audio-reactive waveform (not decorative) -- fed by an AnalyserNode
// tapped off the same mic stream MediaRecorder is already using, so it
// costs nothing extra to set up and gives an honest signal (silence really
// looks flat, speech really moves the bars).
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let waveformRafHandle: number | undefined;

function startWaveform(stream: MediaStream) {
  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  audioCtx.createMediaStreamSource(stream).connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  const bars = document.querySelectorAll<HTMLElement>(".wf-bar");

  const tick = () => {
    if (!analyser) return;
    analyser.getByteFrequencyData(data);
    bars.forEach((bar, i) => {
      const level = data[i] ?? 0;
      const height = 4 + (level / 255) * 36;
      bar.style.height = `${height}px`;
    });
    waveformRafHandle = requestAnimationFrame(tick);
  };
  tick();
}

function stopWaveform() {
  if (waveformRafHandle !== undefined) cancelAnimationFrame(waveformRafHandle);
  waveformRafHandle = undefined;
  analyser = null;
  audioCtx?.close();
  audioCtx = null;
  document.querySelectorAll<HTMLElement>(".wf-bar").forEach((bar) => {
    bar.style.height = "4px";
  });
}

function setRecordUI(recording: boolean) {
  const button = document.querySelector<HTMLButtonElement>("#record-button");
  const hint = document.querySelector<HTMLElement>("#record-hint");
  const dot = document.querySelector<SVGElement>("#record-icon-dot");
  const square = document.querySelector<SVGElement>("#record-icon-square");
  if (button) {
    button.classList.toggle("recording", recording);
    button.setAttribute("aria-label", recording ? t("record_hint_active") : t("record_hint_idle"));
  }
  if (hint) hint.textContent = recording ? t("record_hint_active") : t("record_hint_idle");
  if (dot) dot.style.opacity = recording ? "0" : "1";
  if (square) square.style.opacity = recording ? "1" : "0";
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickRecordMimeType();
  mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  recordedChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start();
  setRecordUI(true);
  startWaveform(stream);

  recordStartedAt = Date.now();
  const timerEl = document.querySelector<HTMLElement>("#record-timer");
  window.clearInterval(recordTimerHandle);
  recordTimerHandle = window.setInterval(() => {
    if (timerEl) timerEl.textContent = formatElapsed(Date.now() - recordStartedAt);
  }, 1000);
}

function stopRecording(): Promise<void> {
  return new Promise((resolve) => {
    if (!mediaRecorder) return resolve();
    const recorder = mediaRecorder;
    recorder.onstop = async () => {
      window.clearInterval(recordTimerHandle);
      stopWaveform();
      setRecordUI(false);
      const timerEl = document.querySelector<HTMLElement>("#record-timer");
      if (timerEl) timerEl.textContent = "0:00";

      const blob = new Blob(recordedChunks, { type: recorder.mimeType });
      const buffer = await blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const extension = extensionForMimeType(recorder.mimeType);
      try {
        const audioPath = await invoke<string>("save_recording", { bytes, extension });
        enqueueJob({ audioPath });
      } catch (err) {
        showRecordNotice(`${t("error_save_recording")}${errorText(err)}`);
      }
      resolve();
    };
    recorder.stream.getTracks().forEach((t) => t.stop());
    recorder.stop();
    mediaRecorder = null;
  });
}

// Inline (role="alert") instead of window.alert(): a native modal steals focus
// and blocks the whole window -- including the stage bar of a patient that is
// still transcribing in the background.
function showRecordNotice(message: string) {
  const el = document.querySelector<HTMLElement>("#record-notice");
  if (!el) return;
  el.textContent = message;
  el.hidden = message === "";
}

async function toggleRecording() {
  if (mediaRecorder) {
    await stopRecording();
  } else {
    showRecordNotice("");
    try {
      await startRecording();
    } catch (err) {
      showRecordNotice(`${t("error_mic_access")}${errorText(err)}`);
    }
  }
}

// ---------- i18n ----------

function applyTranslations() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });

  const textarea = document.querySelector<HTMLTextAreaElement>("#transcript-input");
  if (textarea) {
    textarea.placeholder = t("transcript_placeholder");
    textarea.setAttribute("aria-label", t("transcript_aria_label"));
  }

  const langToggle = document.querySelector<HTMLButtonElement>("#lang-toggle");
  if (langToggle) langToggle.textContent = t("lang_toggle");

  document.documentElement.lang = getLang();

  // Re-render dynamic content built from JS template strings, which
  // data-i18n's static-markup sweep above doesn't reach.
  renderPatientList();
  renderSelectedJob();
}

function setupLangToggle() {
  document.querySelector("#lang-toggle")?.addEventListener("click", () => {
    setLang(getLang() === "en" ? "zh" : "en");
    applyTranslations();
  });
}

// ---------- Tabs ----------

// WAI-ARIA tabs pattern: only the active tab is in the Tab order (roving
// tabindex); arrow keys / Home / End move between tabs. The markup already
// declared role="tablist", which promises this behavior to screen-reader and
// keyboard users.
function setupTabs() {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab-btn"));

  const activate = (tab: HTMLButtonElement) => {
    tabs.forEach((other) => {
      const isActive = other === tab;
      other.classList.toggle("active", isActive);
      other.setAttribute("aria-selected", String(isActive));
      other.tabIndex = isActive ? 0 : -1;
    });
    document.querySelectorAll<HTMLElement>(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${tab.dataset.tab}`);
    });
  };

  tabs.forEach((tab, i) => {
    tab.tabIndex = tab.classList.contains("active") ? 0 : -1;
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      let next = -1;
      if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      activate(tabs[next]);
      tabs[next].focus();
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupLangToggle();
  applyTranslations();
  document.querySelector("#run-button")?.addEventListener("click", queuePastedText);
  document.querySelector("#pick-audio-button")?.addEventListener("click", pickAndQueueAudio);
  document.querySelector("#record-button")?.addEventListener("click", toggleRecording);
  document.querySelector("#job-retry")?.addEventListener("click", retrySelectedJob);
});
