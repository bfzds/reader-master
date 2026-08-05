fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "save_config_file",
            "read_dropped_file",
            "pick_import_folder",
            "get_import_folder_selection",
            "save_file_to_folder",
            "list_import_folder_books",
            "read_file_in_folder",
            "delete_file_in_folder",
            "set_window_size",
        ]),
    ))
    .expect("failed to build Tauri ACL configuration")
}
