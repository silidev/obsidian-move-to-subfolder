const { Plugin, Modal, Notice, TFile, TFolder } = require('obsidian');

class RenameFolderModal extends Modal {
    constructor(app, folder, parentPath, onRenamed) {
        super(app);
        this.folder = folder;
        this.parentPath = parentPath;
        this.onRenamed = onRenamed;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Rename folder' });

        const formEl = contentEl.createEl('form');
        formEl.style.display = 'flex';
        formEl.style.flexDirection = 'column';
        formEl.style.gap = '12px';

        const inputEl = formEl.createEl('input', {
            type: 'text',
            value: this.folder.name
        });
        inputEl.style.width = '100%';
        inputEl.style.padding = '8px';
        inputEl.style.fontSize = '14px';

        const btnContainer = formEl.createDiv();
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '8px';

        const cancelBtn = btnContainer.createEl('button', {
            text: 'Cancel',
            type: 'button'
        });
        cancelBtn.addEventListener('click', () => this.close());

        const submitBtn = btnContainer.createEl('button', {
            text: 'Rename',
            type: 'submit',
            cls: 'mod-cta'
        });

        formEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = inputEl.value.trim();

            if (!newName) {
                new Notice('Folder name cannot be empty.');
                return;
            }

            if (/[\\/:*?"<>|]/.test(newName)) {
                new Notice('Folder name contains invalid characters (: / \\ * ? " < > |).');
                return;
            }

            if (newName === this.folder.name) {
                this.close();
                return;
            }

            const newFolderPath = this.parentPath ? `${this.parentPath}/${newName}` : newName;
            const existing = this.app.vault.getAbstractFileByPath(newFolderPath);
            if (existing) {
                new Notice(`A file or folder named "${newName}" already exists.`);
                return;
            }

            try {
                await this.app.fileManager.renameFile(this.folder, newFolderPath);
                new Notice(`Renamed folder to "${newName}".`);
                if (typeof this.onRenamed === 'function') {
                    this.onRenamed(newFolderPath);
                }
                this.close();
            } catch (err) {
                console.error('Failed to rename folder:', err);
                new Notice(`Failed to rename folder: ${err.message}`);
            }
        });

        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 50);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

module.exports = class MoveToSubfolderPlugin extends Plugin {
    async onload() {
        this.addCommand({
            id: 'move-current-note-to-subfolder',
            name: 'Move the current note into a new subfolder',
            callback: async () => {
                await this.moveToSubfolder();
            }
        });
    }

    async moveToSubfolder() {
        const file = this.app.workspace.getActiveFile();
        if (!file || !(file instanceof TFile)) {
            new Notice('No active note to move.');
            return;
        }

        const parentPath = (file.parent && !file.parent.isRoot() && file.parent.path !== '/')
            ? file.parent.path
            : '';
        const folderName = file.basename;
        const subfolderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

        let folder = this.app.vault.getAbstractFileByPath(subfolderPath);

        if (folder && !(folder instanceof TFolder)) {
            new Notice(`Cannot create folder: A file named "${folderName}" already exists.`);
            return;
        }

        if (!folder) {
            try {
                folder = await this.app.vault.createFolder(subfolderPath);
            } catch (err) {
                console.error('Failed to create folder:', err);
                new Notice(`Failed to create folder "${folderName}": ${err.message}`);
                return;
            }
        }

        const targetFilePath = `${subfolderPath}/${file.name}`;
        if (this.app.vault.getAbstractFileByPath(targetFilePath)) {
            new Notice(`A file named "${file.name}" already exists in "${folderName}".`);
            return;
        }

        try {
            await this.app.fileManager.renameFile(file, targetFilePath);
            new Notice(`Moved "${file.name}" into "${folderName}".`);
        } catch (err) {
            console.error('Failed to move file into subfolder:', err);
            new Notice(`Failed to move file: ${err.message}`);
            return;
        }

        // Open rename dialog for the folder
        new RenameFolderModal(this.app, folder, parentPath).open();
    }
};
