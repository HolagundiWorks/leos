// Native file/folder dialogs via the Tauri plugin. These only work inside the
// desktop app; in a plain browser `isTauri` is false and callers fall back to
// a text input. All pickers return an absolute path string, or null if the
// user cancelled / the dialog is unavailable.

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const LEOSDB_FILTER = [{ name: 'LEOS school file', extensions: ['leosdb'] }];

/** Open-file dialog (single). Defaults to filtering .leosdb files. */
export async function pickFile(filters = LEOSDB_FILTER): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sel = await open({ multiple: false, directory: false, filters });
    return typeof sel === 'string' ? sel : null;
  } catch {
    return null;
  }
}

/** Open-folder dialog. */
export async function pickFolder(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sel = await open({ multiple: false, directory: true });
    return typeof sel === 'string' ? sel : null;
  } catch {
    return null;
  }
}

/** Save-file dialog. Defaults to suggesting a .leosdb name. */
export async function pickSave(defaultPath?: string, filters = LEOSDB_FILTER): Promise<string | null> {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const sel = await save({ defaultPath, filters });
    return typeof sel === 'string' ? sel : null;
  } catch {
    return null;
  }
}
