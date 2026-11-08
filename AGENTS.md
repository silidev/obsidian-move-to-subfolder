## Project Overview

**Plugin name:** Move to Subfolder  
**Plugin ID:** `move-to-subfolder`  
**Location:** `L:\Dropbox\Obsidian\TestVaults\Test1\.obsidian\plugins\move-to-subfolder\`  
**Vault:** `L:\Dropbox\Obsidian\TestVaults\Test1\`  
**Obsidian API minimum version:** `0.15.0`  
**Build system:** None – single-file CommonJS (`main.js`), no TypeScript compilation or bundler required.

---

## What the Plugin Does

The plugin registers one Obsidian command:

> **"Move the current note into a new subfolder"**

### Algorithm

1. Retrieve active note via `app.workspace.getActiveFile()`. If no active note, display Notice.
2. Determine parent folder path and note basename.
3. Compute target subfolder path (`<parentPath>/<noteBasename>`).
4. If a file with that name already exists at that path, display Notice and abort.
5. Create folder if it doesn't exist yet via `app.vault.createFolder(subfolderPath)`.
6. Move the active file into the newly created folder using `app.fileManager.renameFile(file, targetFilePath)`.
7. Automatically open `RenameFolderModal` allowing the user to rename the folder immediately if desired.

---

## Key Obsidian APIs Used

| API | Purpose |
|---|---|
| `app.workspace.getActiveFile()` | Returns the currently open file in editor (`TFile`). |
| `app.vault.getAbstractFileByPath(path)` | Resolves a path string to a `TAbstractFile` (confirming existence or type). |
| `app.vault.createFolder(path)` | Creates the new subfolder. |
| `app.fileManager.renameFile(file, newPath)` | Moves/renames files and folders, automatically updating vault-wide links. |
| `new Notice(message)` | Displays a toast notification. |
| `Modal` | Displays the folder rename dialog. |

---

## Development Workflow

1. Edit `main.js` directly (no build step).
2. Validate syntax: `node --check main.js`.
3. In Obsidian: `Ctrl+P` → *Reload app without saving* (or disable/re-enable plugin in Settings).
4. **Versioning & Changelog (on release):**
   - Increment `"version"` in `manifest.json`.
   - Add entry for the new version under `## Changelog` in `README.md`.
5. **Release to GitHub:**
   - Run `node release.js` (or `./release.ps1`). This reads `release.config.json`, validates syntax, checks git cleanliness, tags the release, pushes to GitHub, creates the GitHub release with the changelog, and uploads release assets.
