#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod shell;
mod window_state;

use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use window_state::physical_to_logical;

const HOST: &str = "127.0.0.1";
const PORT: u16 = 2333;
const DEFAULT_WINDOW_WIDTH: u32 = 1920;
const DEFAULT_WINDOW_HEIGHT: u32 = 1080;
const MIN_WINDOW_WIDTH: u32 = 900;
const MIN_WINDOW_HEIGHT: u32 = 600;
const APP_CONFIG_FILE: &str = "app-config.json";
const IMPORT_FOLDER_CONFIG_FILE: &str = "import-folders.json";
const MAX_IMPORT_FILE_BYTES: u64 = 128 * 1024 * 1024;

struct ImportFolderState(Mutex<ImportFolderRegistry>);
struct StaticServerState {
    _server: shell::StaticServerHandle,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct ImportFolderRegistry {
    selected_id: Option<String>,
    folders: HashMap<String, PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
struct PickFolderResult {
    id: String,
    name: String,
}

#[derive(Clone, serde::Serialize)]
struct SingleInstancePayload {
    args: Vec<String>,
    cwd: String,
}

#[derive(Debug, Clone, Serialize)]
struct FolderFileEntry {
    name: String,
    size: u64,
    #[serde(rename = "lastModified")]
    last_modified: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    bytes: Option<Vec<u8>>,
}

use window_state::WindowSize;

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
struct AppConfig {
    #[serde(rename = "windowSize")]
    window_size: WindowSize,
    #[serde(rename = "windowMaximized")]
    window_maximized: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            window_size: WindowSize {
                width: DEFAULT_WINDOW_WIDTH,
                height: DEFAULT_WINDOW_HEIGHT,
            },
            window_maximized: false,
        }
    }
}

fn normalize_window_size(size: &WindowSize) -> WindowSize {
    WindowSize {
        width: size.width.max(MIN_WINDOW_WIDTH),
        height: size.height.max(MIN_WINDOW_HEIGHT),
    }
}

fn app_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join(APP_CONFIG_FILE))
}

fn import_folder_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join(IMPORT_FOLDER_CONFIG_FILE))
}

fn load_import_folder_registry(app: &AppHandle) -> ImportFolderRegistry {
    let Ok(path) = import_folder_config_path(app) else {
        return ImportFolderRegistry::default();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return ImportFolderRegistry::default();
    };
    let Ok(mut registry) = serde_json::from_str::<ImportFolderRegistry>(&text) else {
        return ImportFolderRegistry::default();
    };
    registry.folders.retain(|_, path| {
        std::fs::canonicalize(path)
            .map(|canonical| canonical.is_dir())
            .unwrap_or(false)
    });
    registry.selected_id = registry
        .selected_id
        .filter(|id| registry.folders.contains_key(id));
    registry
}

fn save_import_folder_registry(
    app: &AppHandle,
    registry: &ImportFolderRegistry,
) -> Result<(), String> {
    let path = import_folder_config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(registry).map_err(|error| error.to_string())?;
    std::fs::write(path, text).map_err(|error| error.to_string())
}

fn create_folder_id() -> String {
    let mut bytes = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn read_app_config(app: &AppHandle) -> AppConfig {
    let path = match app_config_path(app) {
        Ok(path) => path,
        Err(_) => return AppConfig::default(),
    };
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(_) => return AppConfig::default(),
    };
    match serde_json::from_str::<AppConfig>(&text) {
        Ok(mut config) => {
            config.window_size = normalize_window_size(&config.window_size);
            config
        }
        Err(_) => AppConfig::default(),
    }
}

fn write_app_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = app_config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let normalized = AppConfig {
        window_size: normalize_window_size(&config.window_size),
        window_maximized: config.window_maximized,
    };
    let content = serde_json::to_string_pretty(&normalized).map_err(|error| error.to_string())?;
    std::fs::write(path, content).map_err(|error| error.to_string())
}

fn sanitize_filename(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        let invalid =
            matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control();
        out.push(if invalid { '_' } else { ch });
    }
    let trimmed = out.trim();
    if trimmed.is_empty() {
        "book.txt".to_string()
    } else {
        trimmed.to_string()
    }
}

fn is_path_within(root: &Path, target: &Path) -> bool {
    target == root || target.starts_with(root)
}

fn is_symlink(path: &Path) -> Result<bool, String> {
    Ok(std::fs::symlink_metadata(path)
        .map_err(|error| error.to_string())?
        .file_type()
        .is_symlink())
}

fn authorized_file_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let target = root.join(sanitize_filename(name));
    if is_symlink(&target)? {
        return Err("目标文件是符号链接，拒绝访问".to_string());
    }
    let canonical = std::fs::canonicalize(&target).map_err(|_| "书籍文件不存在".to_string())?;
    if !is_path_within(root, &canonical) {
        return Err("书籍文件超出已授权文件夹".to_string());
    }
    Ok(canonical)
}

fn writable_file_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let target = root.join(sanitize_filename(name));
    if target.exists() && is_symlink(&target)? {
        return Err("目标文件是符号链接，拒绝写入".to_string());
    }
    let canonical_parent = std::fs::canonicalize(target.parent().ok_or("目标路径无效")?)
        .map_err(|error| error.to_string())?;
    if canonical_parent != root {
        return Err("目标文件超出已授权文件夹".to_string());
    }
    Ok(target)
}

fn is_supported_book_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("txt" | "gz" | "epub")
    )
}

fn resolve_static_root(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let bundled_candidate = resource_dir.join("treader-frontend");
    if bundled_candidate.exists() {
        return Ok(bundled_candidate);
    }

    // Development fallback: resolve from the Rust project location rather than
    // the process working directory, which varies between shells and launchers.
    let source_candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../app_unpacked/src");
    if source_candidate.exists() {
        return Ok(source_candidate);
    }

    Err(format!(
        "Unable to locate frontend assets in {} or {}",
        bundled_candidate.display(),
        source_candidate.display()
    ))
}

fn authorized_folder(state: &ImportFolderState, folder_id: &str) -> Result<PathBuf, String> {
    let registry = state
        .0
        .lock()
        .map_err(|_| "导入文件夹状态不可用".to_string())?;
    let root = registry
        .folders
        .get(folder_id)
        .ok_or("导入文件夹未授权，请重新选择文件夹")?;
    let canonical = std::fs::canonicalize(root)
        .map_err(|_| "导入文件夹已不可用，请重新选择文件夹".to_string())?;
    if !canonical.is_dir() || canonical != *root {
        return Err("导入文件夹已改变，请重新选择文件夹".to_string());
    }
    Ok(canonical)
}

#[tauri::command]
async fn save_config_file(name: String, content: String) -> Result<bool, String> {
    let filename = sanitize_filename(&name);
    let Some(path) = rfd::FileDialog::new()
        .set_file_name(&filename)
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return Ok(false);
    };
    tokio::fs::write(path, content.as_bytes())
        .await
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn read_dropped_file(path: String) -> Result<FolderFileEntry, String> {
    let source = PathBuf::from(path);
    if is_symlink(&source)? {
        return Err("拖入的文件是符号链接，拒绝读取".to_string());
    }
    let canonical = std::fs::canonicalize(&source).map_err(|error| error.to_string())?;
    if is_symlink(&canonical)? || !canonical.is_file() || !is_supported_book_file(&canonical) {
        return Err("拖入的文件不是支持的 TXT、GZ 或 EPUB 文件".to_string());
    }
    let metadata = tokio::fs::metadata(&canonical)
        .await
        .map_err(|error| error.to_string())?;
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err("书籍文件过大，拒绝读取".to_string());
    }
    let bytes = tokio::fs::read(&canonical)
        .await
        .map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    Ok(FolderFileEntry {
        name: canonical
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("book.txt")
            .to_string(),
        size: metadata.len(),
        last_modified: modified,
        bytes: Some(bytes),
    })
}

#[tauri::command]
async fn pick_import_folder(
    app: AppHandle,
    state: State<'_, ImportFolderState>,
) -> Result<Option<PickFolderResult>, String> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    let canonical = std::fs::canonicalize(&path).map_err(|error| error.to_string())?;
    if !canonical.is_dir() || is_symlink(&canonical)? {
        return Err("导入文件夹路径无效或是符号链接，请重新选择文件夹".to_string());
    }
    let name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| canonical.to_string_lossy().to_string());
    let id = create_folder_id();
    let mut registry = state
        .0
        .lock()
        .map_err(|_| "导入文件夹状态不可用".to_string())?;
    registry.folders.retain(|_, stored| stored != &canonical);
    registry.folders.insert(id.clone(), canonical);
    registry.selected_id = Some(id.clone());
    save_import_folder_registry(&app, &registry)?;
    Ok(Some(PickFolderResult { id, name }))
}

#[tauri::command]
async fn get_import_folder_selection(
    state: State<'_, ImportFolderState>,
) -> Result<Option<PickFolderResult>, String> {
    let registry = state
        .0
        .lock()
        .map_err(|_| "导入文件夹状态不可用".to_string())?;
    let Some(id) = registry.selected_id.as_ref() else {
        return Ok(None);
    };
    let Some(path) = registry.folders.get(id) else {
        return Ok(None);
    };
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    Ok(Some(PickFolderResult {
        id: id.clone(),
        name,
    }))
}

#[tauri::command]
async fn save_file_to_folder(
    state: State<'_, ImportFolderState>,
    folder_id: String,
    name: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    if bytes.len() as u64 > MAX_IMPORT_FILE_BYTES {
        return Err("书籍文件过大，拒绝保存".to_string());
    }
    let resolved = authorized_folder(&state, &folder_id)?;
    let target = writable_file_path(&resolved, &name)?;
    tokio::fs::write(target, bytes)
        .await
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn list_import_folder_books(
    state: State<'_, ImportFolderState>,
    folder_id: String,
) -> Result<Vec<FolderFileEntry>, String> {
    let resolved = authorized_folder(&state, &folder_id)?;
    let mut reader = tokio::fs::read_dir(resolved)
        .await
        .map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    while let Some(entry) = reader
        .next_entry()
        .await
        .map_err(|error| error.to_string())?
    {
        let path = entry.path();
        if !entry
            .file_type()
            .await
            .map_err(|error| error.to_string())?
            .is_file()
            || !is_supported_book_file(&path)
        {
            continue;
        }
        let metadata = entry.metadata().await.map_err(|error| error.to_string())?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);
        result.push(FolderFileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            size: metadata.len(),
            last_modified: modified,
            bytes: None,
        });
    }
    Ok(result)
}

#[tauri::command]
async fn read_file_in_folder(
    state: State<'_, ImportFolderState>,
    folder_id: String,
    name: String,
) -> Result<FolderFileEntry, String> {
    let resolved = authorized_folder(&state, &folder_id)?;
    let filename = sanitize_filename(&name);
    let target = authorized_file_path(&resolved, &filename)?;
    let metadata = tokio::fs::metadata(&target)
        .await
        .map_err(|error| error.to_string())?;
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err("书籍文件过大，拒绝读取".to_string());
    }
    let bytes = tokio::fs::read(&target)
        .await
        .map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    Ok(FolderFileEntry {
        name: filename,
        size: metadata.len(),
        last_modified: modified,
        bytes: Some(bytes),
    })
}

#[tauri::command]
async fn delete_file_in_folder(
    state: State<'_, ImportFolderState>,
    folder_id: String,
    name: String,
) -> Result<bool, String> {
    let resolved = authorized_folder(&state, &folder_id)?;
    let target = writable_file_path(&resolved, &name)?;
    match tokio::fs::remove_file(target).await {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
async fn set_window_size(
    window: WebviewWindow,
    app: AppHandle,
    width: u32,
    height: u32,
) -> Result<bool, String> {
    let normalized = normalize_window_size(&WindowSize { width, height });
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
            normalized.width as f64,
            normalized.height as f64,
        )))
        .map_err(|error| error.to_string())?;
    write_app_config(
        &app,
        &AppConfig {
            window_size: normalized,
            window_maximized: false,
        },
    )?;
    Ok(true)
}

fn persist_window_state(window: &WebviewWindow, app: &AppHandle) {
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        let previous = read_app_config(app);
        let _ = write_app_config(
            app,
            &AppConfig {
                window_size: previous.window_size,
                window_maximized: true,
            },
        );
        return;
    }
    let logical_size = window.inner_size().ok().map(|value| {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        physical_to_logical(value.width, value.height, scale_factor)
    });
    let width = logical_size
        .map(|value| value.width)
        .unwrap_or(DEFAULT_WINDOW_WIDTH);
    let height = logical_size
        .map(|value| value.height)
        .unwrap_or(DEFAULT_WINDOW_HEIGHT);
    let _ = write_app_config(
        app,
        &AppConfig {
            window_size: WindowSize { width, height },
            window_maximized: false,
        },
    );
}

fn should_create_main_window(has_existing_window: bool) -> bool {
    !has_existing_window
}

fn create_main_window(app: &AppHandle, config: &AppConfig) -> Result<WebviewWindow, String> {
    let external_url = format!("http://{}:{}", HOST, PORT);
    let url = tauri::WebviewUrl::External(
        external_url
            .parse::<tauri::Url>()
            .map_err(|error| error.to_string())?,
    );
    let window = tauri::WebviewWindowBuilder::new(app, "main", url)
        .title("tReader")
        .inner_size(
            config.window_size.width as f64,
            config.window_size.height as f64,
        )
        .min_inner_size(MIN_WINDOW_WIDTH as f64, MIN_WINDOW_HEIGHT as f64)
        .resizable(true)
        .visible(true)
        .build()
        .map_err(|error| error.to_string())?;
    if config.window_maximized {
        let _ = window.maximize();
    }
    Ok(window)
}

fn main() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "e2e-webdriver")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("single-instance", SingleInstancePayload { args, cwd });
        }))
        .manage(ImportFolderState(Mutex::new(
            ImportFolderRegistry::default(),
        )))
        .invoke_handler(tauri::generate_handler![
            save_config_file,
            read_dropped_file,
            pick_import_folder,
            get_import_folder_selection,
            save_file_to_folder,
            list_import_folder_books,
            read_file_in_folder,
            delete_file_in_folder,
            set_window_size,
        ])
        .setup(|app| {
            if !cfg!(debug_assertions) {
                let root_dir = resolve_static_root(app.handle())?;
                let static_server = tauri::async_runtime::block_on(shell::spawn_static_server(
                    root_dir, HOST, PORT,
                ))
                .map_err(|error| {
                    let message = format!(
              "无法启动 tReader：固定本地端口 {}:{} 不可用。请关闭占用该端口的程序后重试。原因：{}",
              HOST, PORT, error
            );
                    eprintln!("[tReader startup failed] {}", message);
                    message
                })?;
                app.manage(StaticServerState {
                    _server: static_server,
                });
            }
            let registry = load_import_folder_registry(app.handle());
            *app.state::<ImportFolderState>()
                .0
                .lock()
                .map_err(|_| "导入文件夹状态不可用")? = registry;
            let config = read_app_config(app.handle());
            let window = if let Some(window) = app.get_webview_window("main") {
                window
            } else if should_create_main_window(false) {
                match create_main_window(app.handle(), &config) {
                    Ok(window) => window,
                    Err(error) => app.get_webview_window("main").ok_or(error)?,
                }
            } else {
                return Err("主窗口不可用".to_string().into());
            };
            let handle = app.handle().clone();
            let window_for_close = window.clone();
            let pending_resize_task =
                Arc::new(Mutex::new(None::<tauri::async_runtime::JoinHandle<()>>));
            let pending_resize_task_for_event = pending_resize_task.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { .. } => {
                        if let Ok(mut task) = pending_resize_task_for_event.lock() {
                            if let Some(task) = task.take() {
                                task.abort();
                            }
                        }
                        persist_window_state(&window_for_close, &handle);
                    }
                    tauri::WindowEvent::Resized(_)
                        if !window_for_close.is_maximized().unwrap_or(false) =>
                    {
                        // Resize events arrive in bursts; cancel the prior write and persist only the final size.
                        let window_for_resize = window_for_close.clone();
                        let handle_for_resize = handle.clone();
                        let task_slot = pending_resize_task_for_event.clone();
                        if let Ok(mut task) = task_slot.lock() {
                            if let Some(task) = task.take() {
                                task.abort();
                            }
                            let next_task = tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                                persist_window_state(&window_for_resize, &handle_for_resize);
                            });
                            *task = Some(next_task);
                        };
                    }
                    _ => {}
                }
            });
            let _ = app.emit("treader-shell-ready", true);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        authorized_file_path, authorized_folder, is_path_within, is_supported_book_file,
        normalize_window_size, sanitize_filename, should_create_main_window, writable_file_path,
        AppConfig, ImportFolderRegistry, ImportFolderState, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH,
    };
    use std::collections::HashMap;
    use std::fs::{create_dir_all, remove_dir_all, write};
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_root(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("treader-{label}-{}-{suffix}", std::process::id()))
    }

    #[test]
    fn existing_main_window_is_reused() {
        assert!(!should_create_main_window(true));
    }

    #[test]
    fn missing_main_window_is_created() {
        assert!(should_create_main_window(false));
    }

    #[test]
    fn file_path_must_stay_inside_authorized_folder() {
        let root = PathBuf::from("books");
        assert!(is_path_within(&root, &root.join("novel.txt")));
        assert!(!is_path_within(&root, Path::new("outside/novel.txt")));
    }

    #[test]
    fn supported_book_extensions_are_case_insensitive_and_narrow() {
        assert!(is_supported_book_file(Path::new("book.TXT")));
        assert!(is_supported_book_file(Path::new("book.Gz")));
        assert!(is_supported_book_file(Path::new("book.epub")));
        assert!(!is_supported_book_file(Path::new("book.pdf")));
        assert!(!is_supported_book_file(Path::new("book")));
    }

    #[test]
    fn filenames_are_sanitized_without_empty_targets() {
        assert_eq!(sanitize_filename(""), "book.txt");
        assert_eq!(sanitize_filename("  "), "book.txt");
        assert_eq!(sanitize_filename("../outside.txt"), ".._outside.txt");
        assert_eq!(sanitize_filename("C:\\outside.txt"), "C__outside.txt");
    }

    #[test]
    fn authorized_file_path_accepts_existing_file_and_rejects_missing_file() {
        let root = temp_test_root("authorized-file");
        create_dir_all(&root).expect("create test root");
        let canonical_root = std::fs::canonicalize(&root).expect("canonicalize test root");
        write(root.join("book.txt"), b"content").expect("write test book");

        assert_eq!(
            authorized_file_path(&canonical_root, "book.txt").expect("existing file is authorized"),
            std::fs::canonicalize(root.join("book.txt")).expect("canonicalize test book")
        );
        assert!(authorized_file_path(&canonical_root, "missing.txt").is_err());

        remove_dir_all(&root).expect("remove test root");
    }

    #[test]
    fn writable_file_path_stays_at_authorized_root() {
        let root = temp_test_root("writable-file");
        create_dir_all(&root).expect("create test root");
        let canonical_root = std::fs::canonicalize(&root).expect("canonicalize test root");

        assert_eq!(
            writable_file_path(&canonical_root, "new.txt").expect("new file is writable"),
            canonical_root.join("new.txt")
        );
        assert_eq!(
            writable_file_path(&canonical_root, "").expect("empty filename gets a safe default"),
            canonical_root.join("book.txt")
        );

        remove_dir_all(&root).expect("remove test root");
    }

    #[test]
    fn authorized_folder_requires_registered_live_directory() {
        let root = temp_test_root("authorized-folder");
        create_dir_all(&root).expect("create test root");
        let canonical_root = std::fs::canonicalize(&root).expect("canonicalize test root");
        let mut folders = HashMap::new();
        folders.insert("known-folder".to_string(), canonical_root.clone());
        let state = ImportFolderState(Mutex::new(ImportFolderRegistry {
            selected_id: Some("known-folder".to_string()),
            folders,
        }));

        assert_eq!(
            authorized_folder(&state, "known-folder").expect("registered folder is authorized"),
            canonical_root
        );
        assert!(authorized_folder(&state, "forged-folder").is_err());

        remove_dir_all(&root).expect("remove test root");
        assert!(authorized_folder(&state, "known-folder").is_err());
    }

    #[test]
    fn window_size_normalization_enforces_minimum_dimensions() {
        let normalized = normalize_window_size(&super::WindowSize {
            width: 1,
            height: 1,
        });
        assert_eq!(normalized.width, MIN_WINDOW_WIDTH);
        assert_eq!(normalized.height, MIN_WINDOW_HEIGHT);

        let config = AppConfig::default();
        assert_eq!(config.window_size.width, 1920);
        assert_eq!(config.window_size.height, 1080);
    }
}
