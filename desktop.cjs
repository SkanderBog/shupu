const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { rename, unlink, writeFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { execFile } = require('node:child_process');

app.whenReady().then(() => {
  const window = new BrowserWindow({
    title: '数谱 | 简谱工作台',
    width: 1320,
    height: 920,
    minWidth: 720,
    minHeight: 570,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  const projectPaths = new Map();
  ipcMain.handle('register-opened-project', (event, key, filename) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      typeof key !== 'string' || !/^[a-z\d-]{1,80}$/i.test(key) ||
      typeof filename !== 'string' || !path.isAbsolute(filename) || !['.shupu', '.json'].includes(path.extname(filename).toLowerCase())) return false;
    projectPaths.set(key, filename);
    return true;
  });
  ipcMain.handle('save-project', async (event, params) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return null;
    if (typeof params?.key !== 'string' || !/^[a-z\d-]{1,80}$/i.test(params.key) ||
      typeof params.name !== 'string' || typeof params.content !== 'string')
      throw new Error('无法保存此工程。');
    let destination = projectPaths.get(params.key);
    if (!destination) {
      const result = await dialog.showSaveDialog(window, {
        title: '保存简谱工程', defaultPath: path.basename(params.name),
        filters: [{ name: '简谱工程', extensions: ['shupu', 'json'] }]
      });
      if (result.canceled || !result.filePath) return null;
      destination = result.filePath;
    }
    const temporary = path.join(path.dirname(destination), '.jianpu-' + randomUUID() + '.tmp');
    try {
      await writeFile(temporary, params.content, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
    projectPaths.set(params.key, destination);
    return { name: path.basename(destination) };
  });
  ipcMain.handle('export-pdf', async (event, output) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
    const result = await dialog.showSaveDialog(window, {
      title: output === 'manual' ? '导出功能手册 PDF' : '导出总谱 PDF',
      defaultPath: output === 'manual' ? '数谱功能手册.pdf' : '合唱总谱.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return false;
    const pdf = await window.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
    await writeFile(result.filePath, pdf);
    return true;
  });
  ipcMain.handle('list-fonts', async event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || process.platform !== 'win32') return [];
    return new Promise(resolve => execFile('powershell.exe',
      ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object Name'],
      { windowsHide: true, timeout: 5000 }, (error, output) => resolve(error ? [] : output.split(/\r?\n/).map(name => name.trim()).filter(Boolean))));
  });
  window.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
