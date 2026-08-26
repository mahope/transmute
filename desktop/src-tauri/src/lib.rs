use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{Manager, State};

/// Persisted license state
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LicenseState {
    pub license_key: Option<String>,
    pub instance_id: Option<String>,
    pub product: Option<String>,
    pub email: Option<String>,
    pub activated_at: Option<String>,
}

pub struct AppState {
    pub license: Mutex<LicenseState>,
}

/// Free tier: transformations per launch without a Pro license
const FREE_RUN_LIMIT: usize = 3;

/// Runs used this session (free-tier counter; resets on restart)
static RUNS_THIS_SESSION: AtomicUsize = AtomicUsize::new(0);

// ─── Persistence helpers ─────────────────────────────────────────────

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn save_license(app: &tauri::AppHandle, lic: &LicenseState) {
    if let Ok(json) = serde_json::to_string_pretty(lic) {
        let _ = std::fs::write(data_dir(app).join("license.json"), json);
    }
}

fn load_license(app: &tauri::AppHandle) -> LicenseState {
    std::fs::read_to_string(data_dir(app).join("license.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn is_licensed(app: &tauri::AppHandle) -> bool {
    load_license(app).license_key.is_some()
}

// ─── Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn get_free_limit() -> usize {
    FREE_RUN_LIMIT
}

#[tauri::command]
fn get_runs_used() -> usize {
    RUNS_THIS_SESSION.load(Ordering::Relaxed)
}

#[tauri::command]
fn get_license_state(app: tauri::AppHandle) -> LicenseState {
    load_license(&app)
}

/// Activate a Lemon Squeezy license key for this machine
#[tauri::command]
async fn activate_license(
    license_key: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<LicenseState, String> {
    let machine = hostname();

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.lemonsqueezy.com/v1/licenses/activate")
        .form(&[
            ("license_key", license_key.as_str()),
            ("instance_name", machine.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = resp.status();
    let data: serde_json::Value =
        resp.json().await.map_err(|e| format!("Bad response: {}", e))?;

    if !status.is_success() || data["activated"].as_bool() != Some(true) {
        let msg = data["error"]
            .as_str()
            .unwrap_or("License activation failed");
        return Err(msg.to_string());
    }

    let lic = LicenseState {
        license_key: Some(license_key),
        instance_id: data["instance"]["id"].as_str().map(String::from),
        product: data["meta"]["product_name"].as_str().map(String::from),
        email: data["meta"]["customer_email"].as_str().map(String::from),
        activated_at: Some(chrono::Utc::now().to_rfc3339()),
    };
    save_license(&app, &lic);
    *state.license.lock().unwrap() = lic.clone();
    Ok(lic)
}

/// Remove activation from this machine
#[tauri::command]
fn deactivate_license(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    let lic = load_license(&app);
    let _ = std::fs::remove_file(data_dir(&app).join("license.json"));
    *state.license.lock().unwrap() = LicenseState::default();
    if let (Some(key), Some(instance)) = (&lic.license_key, &lic.instance_id) {
        let key = key.clone();
        let instance = instance.clone();
        tauri::async_runtime::spawn(async move {
            let client = reqwest::Client::new();
            let _ = client
                .post("https://api.lemonsqueezy.com/v1/licenses/deactivate")
                .form(&[("license_key", key.as_str()), ("instance_id", instance.as_str())])
                .send()
                .await;
        });
    }
    Ok(())
}

/// Count one transformation against the free tier.
/// Returns Err when the free limit is exhausted and there is no Pro license.
#[tauri::command]
fn count_run(app: tauri::AppHandle) -> Result<usize, String> {
    if is_licensed(&app) {
        return Ok(RUNS_THIS_SESSION.load(Ordering::Relaxed));
    }
    let used = RUNS_THIS_SESSION.fetch_add(1, Ordering::Relaxed) + 1;
    if used > FREE_RUN_LIMIT {
        RUNS_THIS_SESSION.store(FREE_RUN_LIMIT, Ordering::Relaxed);
        return Err(format!(
            "Free version runs {} transformations per launch. Upgrade to Pro for unlimited use.",
            FREE_RUN_LIMIT
        ));
    }
    Ok(used)
}

// ─── Helpers ─────────────────────────────────────────────────────────

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "desktop".to_string())
}

// ─── App entry ───────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_free_limit,
            get_runs_used,
            get_license_state,
            activate_license,
            deactivate_license,
            count_run,
        ])
        .setup(|app| {
            let state = AppState {
                license: Mutex::new(load_license(app.handle())),
            };
            app.manage(state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
