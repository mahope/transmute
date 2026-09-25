use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{Manager, State};

/// Persisted license state
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct LicenseState {
    pub license_key: Option<String>,
    pub device_id: Option<String>,
    pub product: Option<String>,
    pub plan: Option<String>,
    pub expires_at: Option<String>,
    pub activated_at: Option<String>,
}

pub struct AppState {
    pub license: Mutex<LicenseState>,
}

/// Mahope license server (Stripe purchases). Replaces the Lemon Squeezy API.
const LICENSE_API: &str = "https://mahope.tools/api/license";

/// product_key for this app on the license server
const PRODUCT_KEY: &str = "transmute-desktop";

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

/// Pro status is the locally stored activation. It is never re-checked
/// against the server, so an unreachable license server cannot lock out a
/// paying customer.
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

/// Activate a license key for this machine against the Mahope license server
#[tauri::command]
async fn activate_license(
    license_key: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<LicenseState, String> {
    let key = normalize_key(&license_key)?;
    let device = device_id(&app);

    let resp = http_client()
        .post(format!("{}/activate", LICENSE_API))
        .json(&activate_body(&key, &device))
        .send()
        .await
        .map_err(|_| SERVER_UNAVAILABLE.to_string())?;

    let status = resp.status().as_u16();
    // A non-JSON body (e.g. a proxy error page) is treated as empty
    let data: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);

    let lic = parse_activation(status, &data, &key, &device)?;
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
    if let Some(key) = lic.license_key {
        let device = lic.device_id.unwrap_or_else(|| device_id(&app));
        // Best effort: frees the seat on the server. Local deactivation never
        // depends on the network.
        tauri::async_runtime::spawn(async move {
            let _ = http_client()
                .post(format!("{}/deactivate", LICENSE_API))
                .json(&deactivate_body(&key, &device))
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

const SERVER_UNAVAILABLE: &str =
    "The license server is temporarily unavailable. Please try again in a few minutes.";

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Trim and lowercase a key, and check the server's format (32 hex chars)
fn normalize_key(raw: &str) -> Result<String, String> {
    let key = raw.trim().to_ascii_lowercase();
    if key.len() == 32 && key.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(key)
    } else {
        Err("That does not look like a Transmute license key (32 characters, 0-9 and a-f). \
             Copy it from your purchase email."
            .to_string())
    }
}

fn activate_body(key: &str, device: &str) -> serde_json::Value {
    serde_json::json!({ "license_key": key, "device_id": device, "product": PRODUCT_KEY })
}

fn deactivate_body(key: &str, device: &str) -> serde_json::Value {
    serde_json::json!({ "license_key": key, "device_id": device })
}

/// Turn a license-server response into a license state or a user-facing error
fn parse_activation(
    status: u16,
    data: &serde_json::Value,
    key: &str,
    device: &str,
) -> Result<LicenseState, String> {
    if status == 200
        && data["ok"].as_bool() == Some(true)
        && data["activated"].as_bool() == Some(true)
    {
        return Ok(LicenseState {
            license_key: Some(key.to_string()),
            device_id: Some(device.to_string()),
            product: Some(PRODUCT_KEY.to_string()),
            plan: data["plan"].as_str().map(String::from),
            expires_at: data["expires_at"].as_str().map(String::from),
            activated_at: Some(chrono::Utc::now().to_rfc3339()),
        });
    }
    // Server trouble: fail softly with a retry hint, never a verdict on the key
    if status >= 500 {
        return Err(SERVER_UNAVAILABLE.to_string());
    }
    let server_msg = data["error"].as_str().or_else(|| data["message"].as_str());
    let fallback = match status {
        400 => "That does not look like a valid license key.",
        404 => "License key not found. Check that you copied the whole key.",
        403 => "This license key is expired, revoked or for another product.",
        409 => "This license is already active on the maximum number of machines. \
                Deactivate it on another machine first.",
        _ => "License activation failed.",
    };
    Err(server_msg.unwrap_or(fallback).to_string())
}

/// Stable per-installation id sent to the license server. Generated once and
/// kept in the app data dir, so it survives deactivate/re-activate.
fn device_id(app: &tauri::AppHandle) -> String {
    let path = data_dir(app).join("device_id");
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let existing = existing.trim();
        if !existing.is_empty() && existing.len() <= 128 {
            return existing.to_string();
        }
    }
    let id = new_device_id(&hostname());
    let _ = std::fs::write(&path, &id);
    id
}

fn new_device_id(host: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut parts = [0u64; 2];
    for (i, part) in parts.iter_mut().enumerate() {
        let mut h = DefaultHasher::new();
        (host, nanos, std::process::id(), i).hash(&mut h);
        *part = h.finish();
    }
    format!("tmd-{:016x}{:016x}", parts[0], parts[1])
}

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "desktop".to_string())
}

// ─── App entry ───────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const KEY: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn normalize_key_trims_and_lowercases() {
        let raw = format!("  {}\n", KEY.to_uppercase());
        assert_eq!(normalize_key(&raw).unwrap(), KEY);
    }

    #[test]
    fn normalize_key_rejects_bad_format() {
        assert!(normalize_key("").is_err());
        // old Lemon Squeezy key format
        assert!(normalize_key("38b1460a-5104-4067-a91d-77b872934d51").is_err());
        assert!(normalize_key(&format!("{}0", KEY)).is_err());
        assert!(normalize_key("zz23456789abcdef0123456789abcdef").is_err());
    }

    #[test]
    fn request_bodies_match_contract() {
        assert_eq!(
            activate_body(KEY, "dev1"),
            json!({ "license_key": KEY, "device_id": "dev1", "product": "transmute-desktop" })
        );
        assert_eq!(
            deactivate_body(KEY, "dev1"),
            json!({ "license_key": KEY, "device_id": "dev1" })
        );
    }

    #[test]
    fn parse_activation_success() {
        let body = json!({
            "ok": true, "activated": true, "plan": "pro", "expires_at": null, "devices_in_use": 1
        });
        let lic = parse_activation(200, &body, KEY, "dev1").unwrap();
        assert_eq!(lic.license_key.as_deref(), Some(KEY));
        assert_eq!(lic.device_id.as_deref(), Some("dev1"));
        assert_eq!(lic.product.as_deref(), Some("transmute-desktop"));
        assert_eq!(lic.plan.as_deref(), Some("pro"));
        assert_eq!(lic.expires_at, None);
        assert!(lic.activated_at.is_some());
    }

    #[test]
    fn parse_activation_requires_activated_true() {
        let body = json!({ "ok": true, "activated": false });
        assert!(parse_activation(200, &body, KEY, "d").is_err());
    }

    #[test]
    fn parse_activation_maps_errors() {
        let e = parse_activation(409, &json!({ "ok": false }), KEY, "d").unwrap_err();
        assert!(e.contains("maximum number of machines"));
        let body = json!({ "error": "This license key is for another product." });
        let e = parse_activation(403, &body, KEY, "d").unwrap_err();
        assert_eq!(e, "This license key is for another product.");
        let e = parse_activation(404, &serde_json::Value::Null, KEY, "d").unwrap_err();
        assert!(e.contains("not found"));
    }

    #[test]
    fn parse_activation_fails_softly_on_server_errors() {
        for status in [500u16, 502, 503] {
            let e = parse_activation(status, &json!({ "error": "db down" }), KEY, "d").unwrap_err();
            assert_eq!(e, SERVER_UNAVAILABLE);
        }
    }

    #[test]
    fn device_id_format() {
        let id = new_device_id("host");
        assert!(id.starts_with("tmd-"));
        assert_eq!(id.len(), 36);
    }

    #[test]
    fn old_license_file_still_loads() {
        // license.json written by the Lemon Squeezy build
        let old = r#"{"license_key":"abc","instance_id":"x","product":"Transmute","email":"a@b.c","activated_at":"2026-01-01T00:00:00Z"}"#;
        let lic: LicenseState = serde_json::from_str(old).unwrap();
        assert_eq!(lic.license_key.as_deref(), Some("abc"));
        assert_eq!(lic.device_id, None);
    }
}
