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

#[tauri::command]
async fn run_note_pipeline(app: tauri::AppHandle, transcript: String) -> Result<String, String> {
    log(&format!("run_note_pipeline: start, transcript len={}", transcript.len()));
    let _ = app.emit("pipeline-stage", "processing");
    let file_path = std::env::temp_dir().join("tcm_transcript_input.txt");
    std::fs::write(&file_path, &transcript).map_err(|e| {
        log(&format!("run_note_pipeline: failed to write temp file: {}", e));
        e.to_string()
    })?;
    log("run_note_pipeline: temp file written, spawning sidecar 'main'");

    let sidecar_command = app.shell().sidecar("main").map_err(|e| {
        log(&format!("run_note_pipeline: sidecar() lookup failed: {}", e));
        e.to_string()
    })?;
    let output = sidecar_command
        .args([file_path.to_string_lossy().to_string()])
        .output()
        .await
        .map_err(|e| {
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
        .invoke_handler(tauri::generate_handler![save_recording, run_note_pipeline, run_transcribe_and_process])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
