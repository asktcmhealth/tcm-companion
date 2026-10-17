# Android tablet/phone test checklist

Goal: find out what only a real device can tell us. Nothing here needs patient data: read the
simulation scripts aloud. Write down what you see; the **Report back** block at the end is
everything I need.

## 0. Before you start
- [ ] Device is arm64 (almost every tablet/phone since ~2017). Note the model, Android version and
      RAM (Settings > About). The speech model needs roughly 1.5-2 GB free RAM while transcribing.
- [ ] At least **2 GB free storage** (the speech model is 539 MB, plus the app and recordings).
- [ ] Wi-Fi for the one-time model download. Plugged in or >50% battery.
- [ ] Close other apps on the device.

## 1. Install
APK: `mobile\android\app\build\outputs\apk\release\app-release.apk` (I will rebuild it first so it
contains the latest changes; check its date).
1. Copy the APK to the device (USB cable, Google Drive, or email to yourself).
2. Open it on the device. Android will ask to allow installs from this source: allow it.
3. Open **TCM Scribe**.

- [ ] Installs without an error.
- [ ] App opens to the "One-time setup" screen (English; the **中文** button switches language).
- [ ] The app icon and name look right on the home screen.

## 2. Model download
1. Tap **Download speech model**.
- [ ] Progress bar moves; it finishes (note how long it took).
- [ ] Then it loads the model and shows the green leaf **Record** button.
- [ ] (Optional) Turn Wi-Fi off, close and reopen the app: it should open straight to Record with
      no download and no internet needed.

## 3. Microphone and recording
1. Tap the leaf button. Android asks for microphone permission: allow.
2. Read **benchmark/simulation_script.txt, first passage** aloud (about 1.5 minutes) at a normal pace.
- [ ] Button turns red with a stop square, a ring pulses, the timer counts up, the level bar moves.
- [ ] The screen does not turn off while recording (leave it untouched for 1+ minute).
3. Tap Stop.
- [ ] It switches to transcribing and shows the "keep the app open" hint.
- [ ] **Time how long transcription takes** (stopwatch). This is the number we do not know yet.
- [ ] The screen stays on during transcription (do not touch it).
- [ ] No crash, freeze or "app not responding" message.

Also try (each once):
- [ ] **Deny** the microphone permission on a fresh install: the app should say so clearly.
- [ ] Record in silence for 5 seconds: it should warn "We can't hear anything".

## 4. Results screen
After transcription finishes you should see **Prescription draft**.
- [ ] A yellow "Check before sign-off" banner and "Doses checked ... 0 of N" line.
- [ ] Herbs with their grams. Compare with the script: how many herb names are right?
      (Desktop gets 24 of 25 on this script; the iPhone simulator got 24 of 25.)
- [ ] Uncertain herbs show a **Verify** chip and "could also be ...".
- [ ] Tick a **Dose checked** box: the count goes up; untick: it goes down.
- [ ] **Keep ...** / **Use ...** on an uncertain herb: the chip changes to Confirmed / Edited;
      **Undo** restores it.
- [ ] **Edit dose**: type a number, Save. Typing letters shows an error. A very large number shows
      "OUTSIDE typical range".
- [ ] **Share draft**: the Android share sheet opens; send it to yourself. The text starts with
      "DRAFT from speech recognition - not signed off" and contains no transcript text.
- [ ] **Show transcript / Hide transcript** works.
- [ ] Switch to **中文** and back: all text changes, nothing is cut off.
- [ ] Rotate the device (if you use it sideways): nothing breaks or disappears.
- [ ] Dark mode (device setting): text is readable everywhere.

## 5. Acupuncture (optional, once you have recorded it)
Read `benchmark/simulation_script_3_acupuncture.txt`. Check the **Acupuncture treatment** section
lists the points, flags uncertain ones, and does NOT list 足临泣 (said as "暂不取").

## 6. Stress and recovery
- [ ] Record about 5 minutes (read two passages): does it still transcribe, and how long does it take?
- [ ] While transcribing, press Home and come back: does it carry on or restart?
- [ ] Let the screen lock on purpose during a recording (only if you want to know): note what happens.
- [ ] Force-close and reopen right after a result: the app opens cleanly (results are not saved
      yet, so they will be gone; that is expected).
- [ ] The device does not get uncomfortably hot, and battery drop for one transcription is small.

## 7. Privacy settings
- [ ] Bottom of the screen shows "Recordings are deleted from this phone after 30 days. Tap to
      change." Tapping switches to 90 days and back.
- [ ] No internet is used after the model is downloaded (airplane mode test in section 2).

## Report back (copy, fill in, send me)
```
Device model / Android version / RAM:
Install OK? (Y/N, any message):
Model download time:
Recorded length (min):
Transcription time (min):
Herb names right (n of 25):
Anything that crashed, froze, looked wrong or was cut off:
Screen stayed on during recording / transcribing? (Y/N):
Screenshots (results screen, any error):
```
If something crashes, the most useful extra is a screenshot of the error plus the exact step.
If you can, connect the device by USB with USB debugging on and tell me; I can then read the
crash log directly.
