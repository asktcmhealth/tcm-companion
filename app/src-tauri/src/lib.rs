use std::io::Write;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;

// Diagnostic logging to a fixed file -- added specifically because a GUI-
// triggered run failed with a truncated error (prints "Loading Whisper
// large-v3..." then dies, no traceback, no progress-bar output at all) that
// could NOT be reproduced by invoking the exact same binary/path directly
// from the command line (that works perfectly, full transcript, no errors).
// Since there's no way to attach a debugger or watch a live GUI process,
// this file is the only visibility into what actually happens step by step
// when Tauri itself spawns the sidecar.
fn log(msg: &str) {
    let log_path = std::env::temp_dir().join("tcm_app_debug.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(f, "[{}] {}", chrono_now(), msg);
    }
}

fn chrono_now() -> String {
    // Avoid pulling in a chrono dependency just for a log timestamp.
    use std::time::{SystemTime, UNIX_EPOCH};
    format!("{:?}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default())
}

// Saves an in-app recording's raw bytes to a temp file and hands back the
// path, so it can be fed into the exact same run_transcribe_and_process
// command as a file picked from disk -- no separate recording pipeline to
// keep in sync with the file-based one. Retention-policy handling
// (delete_on_sign | 30_days | 90_days, per plan-review.md) is a locked
// FUTURE requirement, not implemented yet -- same gap as the existing
// temp-file writes in run_note_pipeline below, not new to this command.
#[tauri::command]
fn save_recording(bytes: Vec<u8>, extension: String) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let file_name = format!("tcm_recording_{}.{}", nanos, extension);
    let path = std::env::temp_dir().join(file_name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// Deletes this app's own in-app recordings (tcm_recording_*) older than
// max_age_days from `dir`. Files the physician picked from disk are never in
// this folder under this name, so they are never touched. Returns how many
// were removed; individual failures are skipped, never fatal.
fn purge_old_recordings_in(dir: &std::path::Path, max_age_days: u64) -> usize {
    let max_age = std::time::Duration::from_secs(max_age_days * 24 * 60 * 60);
    let mut removed = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("tcm_recording_") {
                continue;
            }
            let age = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok());
            if matches!(age, Some(a) if a > max_age) && std::fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

#[tauri::command]
fn purge_old_recordings(days: u64) -> usize {
    purge_old_recordings_in(&std::env::temp_dir(), days)
}

#[tauri::command]
async fn run_note_pipeline(app: tauri::AppHandle, transcript: String) -> Result<String, String> {
    log(&format!("run_note_pipeline: start, transcript len={}", transcript.len()));
    let _ = app.emit("pipeline-stage", "processing");
    // Unique per call, and removed as soon as the sidecar returns: this file
    // holds the RAW transcript -- name, NRIC, phone number, un-redacted -- and
    // exists only as an IPC handoff to the sidecar, so nothing should outlive
    // the call. (It used to be one fixed filename that was never deleted.)
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_path = std::env::temp_dir().join(format!("tcm_transcript_input_{}.txt", nanos));
    std::fs::write(&file_path, &transcript).map_err(|e| {
        log(&format!("run_note_pipeline: failed to write temp file: {}", e));
        let _ = std::fs::remove_file(&file_path); // a failed write can still leave a partial file
        e.to_string()
    })?;
    log("run_note_pipeline: temp file written, spawning sidecar 'main'");

    let sidecar_command = app.shell().sidecar("main").map_err(|e| {
        log(&format!("run_note_pipeline: sidecar() lookup failed: {}", e));
        let _ = std::fs::remove_file(&file_path);
        e.to_string()
    })?;
    let output_result = sidecar_command
        .args([file_path.to_string_lossy().to_string()])
        .output()
        .await;
    // Delete before inspecting the result, so the failure path cleans up too.
    let _ = std::fs::remove_file(&file_path);
    let output = output_result.map_err(|e| {
        log(&format!("run_note_pipeline: output().await failed: {}", e));
        e.to_string()
    })?;

    log(&format!(
        "run_note_pipeline: sidecar exited, success={}, stdout_len={}, stderr_len={}",
        output.status.success(),
        output.stdout.len(),
        output.stderr.len()
    ));

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn run_transcribe_and_process(app: tauri::AppHandle, audio_path: String) -> Result<String, String> {
    log(&format!("run_transcribe_and_process: start, audio_path={}", audio_path));
    let _ = app.emit("pipeline-stage", "transcribing");

    let whisper_sidecar = app.shell().sidecar("main-whisper").map_err(|e| {
        log(&format!("run_transcribe_and_process: sidecar() lookup failed: {}", e));
        e.to_string()
    })?;
    log("run_transcribe_and_process: spawning sidecar 'main-whisper', awaiting output...");

    let whisper_output = whisper_sidecar
        .args([audio_path])
        .output()
        .await
        .map_err(|e| {
            log(&format!("run_transcribe_and_process: output().await errored: {}", e));
            e.to_string()
        })?;

    log(&format!(
        "run_transcribe_and_process: whisper sidecar exited, success={}, code={:?}, stdout_len={}, stderr_len={}",
        whisper_output.status.success(),
        whisper_output.status.code(),
        whisper_output.stdout.len(),
        whisper_output.stderr.len()
    ));
    // Full stderr, not just what gets shown in the UI error string -- this is
    // the piece that was getting truncated/lost before.
    log(&format!(
        "run_transcribe_and_process: full stderr:\n{}",
        String::from_utf8_lossy(&whisper_output.stderr)
    ));

    if !whisper_output.status.success() {
        return Err(format!(
            "Transcription failed: {}",
            String::from_utf8_lossy(&whisper_output.stderr)
        ));
    }
    let transcript = String::from_utf8_lossy(&whisper_output.stdout).to_string();
    log(&format!("run_transcribe_and_process: got transcript len={}, handing to run_note_pipeline", transcript.len()));

    run_note_pipeline(app, transcript).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_recording, purge_old_recordings, run_note_pipeline, run_transcribe_and_process])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    fn make(dir: &std::path::Path, name: &str, age_days: u64) {
        let path = dir.join(name);
        std::fs::write(&path, b"x").unwrap();
        let when = SystemTime::now() - Duration::from_secs(age_days * 24 * 60 * 60);
        std::fs::File::options().write(true).open(&path).unwrap().set_modified(when).unwrap();
    }

    #[test]
    fn purges_only_old_app_recordings() {
        let dir = std::env::temp_dir().join(format!("tcm_purge_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        make(&dir, "tcm_recording_old.webm", 31);
        make(&dir, "tcm_recording_new.webm", 29);
        make(&dir, "someone_elses_old.webm", 400);
        assert_eq!(purge_old_recordings_in(&dir, 30), 1);
        assert!(!dir.join("tcm_recording_old.webm").exists());
        assert!(dir.join("tcm_recording_new.webm").exists());
        assert!(dir.join("someone_elses_old.webm").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
