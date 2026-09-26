# iOS build status

No Mac is needed to build: Codemagic (cloud macOS) does it from `codemagic.yaml`.
Everything below was prepared without a Mac, so **none of it has been compiled yet**;
the first Simulator build is the real test.

## Ready in the repo
- Bundle ID `com.tcmscribemobile` (matches Android), display name "TCM Scribe".
- `Info.plist`: microphone purpose string, `ITSAppUsesNonExemptEncryption=false`
  (HTTPS-only traffic, exempt), no unused permission strings.
- `PrivacyInfo.xcprivacy`: file-timestamp, user-defaults, boot-time, **disk-space (E174.1)**.
  `react-native-fs` reads free disk space and ships no manifest of its own, so without the
  disk-space entry App Store Connect rejects the upload (ITMS-91053).
- `TCMScribeMobile.entitlements`: Extended Virtual Addressing + Increased Memory Limit
  (the 539 MB speech model needs the headroom on iPhones with 4 GB RAM).
- Model stored in `Library/models`, flagged excluded-from-backup. In Documents it would be
  copied to iCloud, which Apple rejects for large re-downloadable files.
- App icon (1024 px, placeholder-quality, see `tools/generate_icons.py`) and a real launch screen.
- `codemagic.yaml`: `ios-simulator-build` (no signing) and `ios-device-build` (TestFlight).

## Blocked on you (account-level, cannot be done from here)
1. Connect the GitHub repo in Codemagic, then run **`ios-simulator-build`**. It needs no Apple
   account and is the first real proof that `whisper.rn`, `react-native-fs` and the audio
   module compile for iOS.
2. Enroll in the Apple Developer Program (US$99/yr), create an App Store Connect API key,
   add it in Codemagic as an integration named `codemagic`.
3. In the developer portal, enable **Extended Virtual Addressing** and **Increased Memory
   Limit** on the App ID `com.tcmscribemobile`. The entitlements file requests them; signing
   is expected to fail if the App ID doesn't have them (verify on the first device build).

## Only a real iPhone can answer
- Speed and memory of `ggml-medium-q5_0` (Metal / Core ML are on by default in whisper.rn).
- Whether iOS suspends transcription when the screen auto-locks. The app tells the user to
  keep it open; a keep-awake module is the fix if it matters (deliberately not added yet:
  the app is meant to stay small).
- Denied microphone permission records silence without an error on iOS. The recorder
  detects this from input level and warns after 4 seconds; confirm it fires on a device.
