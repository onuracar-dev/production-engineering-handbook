use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Synchronizes authenticated session credentials from the active Chrome profile
/// into a temporary shadow profile directory without encountering SQLite file-lock errors.
/// The caller owns the returned directory and removes it after the session.
pub fn sync_chrome_profile() -> Result<PathBuf, String> {
    let src_root = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .ok()
            .map(|l| PathBuf::from(l).join(r"Google\Chrome\User Data"))
    } else if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Library/Application Support/Google/Chrome"))
    } else {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join(".config/google-chrome"))
    }.ok_or_else(|| "Failed to resolve Chrome User Data directory".to_string())?;

    if !src_root.exists() {
        return Err("Chrome profile directory not found".to_string());
    }

    // A fresh, unpredictable, owner-only directory: a fixed /tmp path could be pre-created by another user
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let target_profile = std::env::temp_dir()
        .join(format!("llmconductor-chrome-profile-{}-{}", std::process::id(), stamp));
    create_private_dir(&target_profile)?;
    let target_default = target_profile.join("Default");
    let target_network = target_default.join("Network");
    fs::create_dir_all(&target_network).map_err(|e| format!("Failed to create directories: {}", e))?;

    // 1. Copy Local State (contains DPAPI decryption key for Chrome)
    copy_if_exists(&src_root.join("Local State"), &target_profile.join("Local State"))?;

    // 2. Clone session preferences without process kill (saved passwords and autofill stay behind)
    for fname in &["Preferences", "Secure Preferences"] {
        copy_if_exists(&src_root.join("Default").join(fname), &target_default.join(fname))?;
    }

    // 3. Copy cookie database; a failed copy is an error, not a silently cookie-less profile
    copy_if_exists(
        &src_root.join("Default").join("Network").join("Cookies"),
        &target_network.join("Cookies"),
    )?;

    Ok(target_profile)
}

fn copy_if_exists(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    fs::copy(src, dst)
        .map(|_| ())
        .map_err(|e| format!("Failed to copy {}: {}", src.display(), e))
}

/// Creates a new directory readable only by the current user; fails if the path already exists.
fn create_private_dir(path: &Path) -> Result<(), String> {
    let mut builder = fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(path)
        .map_err(|e| format!("Failed to create shadow profile {}: {}", path.display(), e))
}
