const vscode = require('vscode');

class LaunchpadViewProvider {
  constructor(context) {
    this._context = context;
    this._view = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: []
    };

    this._render();

    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'switchProject': {
          const uri = vscode.Uri.file(message.path);
          await vscode.commands.executeCommand('vscode.openFolder', uri, false);
          break;
        }
        case 'addCurrent': {
          await addCurrentProject();
          this._render();
          break;
        }
        case 'removeProject': {
          const config = vscode.workspace.getConfiguration('projectTabs');
          const projects = (config.get('projects') || []).filter(p => p.path !== message.path);
          await config.update('projects', projects, vscode.ConfigurationTarget.Global);
          this._render();
          break;
        }
        case 'rename': {
          const config = vscode.workspace.getConfiguration('projectTabs');
          const projects = config.get('projects') || [];
          const updated = projects.map(p =>
            p.path === message.path ? { ...p, name: message.name } : p
          );
          await config.update('projects', updated, vscode.ConfigurationTarget.Global);
          this._render();
          break;
        }
        case 'setPosition': {
          const pos = ['left', 'top', 'right'].includes(message.position) ? message.position : 'top';
          await vscode.workspace
            .getConfiguration('projectTabs')
            .update('position', pos, vscode.ConfigurationTarget.Global);
          this._render();
          break;
        }
      }
    });

    // Re-render when config or workspace changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('projectTabs.projects') ||
        e.affectsConfiguration('projectTabs.position')
      ) this._render();
    });
    vscode.workspace.onDidChangeWorkspaceFolders(() => this._render());
  }

  _render() {
    if (!this._view) return;
    const config = vscode.workspace.getConfiguration('projectTabs');
    const projects = config.get('projects') || [];
    const position = ['left', 'top', 'right'].includes(config.get('position')) ? config.get('position') : 'top';
    const active = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;
    this._view.webview.html = getHtml(projects, active, position);
  }

  refresh() { this._render(); }
}

async function addCurrentProject() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) {
    vscode.window.showWarningMessage('No folder is currently open.');
    return;
  }
  const folder = folders[0];
  const config = vscode.workspace.getConfiguration('projectTabs');
  const projects = config.get('projects') || [];

  if (projects.find(p => p.path === folder.uri.fsPath)) {
    vscode.window.showInformationMessage('Already pinned!');
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: 'Name for this project tab',
    value: folder.name
  });
  if (!name) return;

  projects.push({ name, path: folder.uri.fsPath });
  await config.update('projects', projects, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Pinned "${name}"`);
}

async function switchProjectQuickPick() {
  const config = vscode.workspace.getConfiguration('projectTabs');
  const projects = config.get('projects') || [];
  if (projects.length === 0) {
    vscode.window.showInformationMessage('No pinned projects yet. Use "Pin Current Project" first.');
    return;
  }

  const activePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;
  const picked = await vscode.window.showQuickPick(
    projects.map(p => ({
      label: p.name,
      description: p.path,
      path: p.path,
      picked: p.path === activePath
    })),
    { placeHolder: 'Switch to a pinned project' }
  );
  if (!picked) return;

  const uri = vscode.Uri.file(picked.path);
  await vscode.commands.executeCommand('vscode.openFolder', uri, false);
}

async function focusProjectTabsView() {
  await vscode.commands.executeCommand('workbench.view.extension.launchpadContainer');
}

function getPinnedProjects() {
  const config = vscode.workspace.getConfiguration('projectTabs');
  return config.get('projects') || [];
}

function getStatusBarMaxItems() {
  const config = vscode.workspace.getConfiguration('projectTabs');
  const n = Number(config.get('statusBarMaxItems'));
  if (!Number.isFinite(n)) return 6;
  return Math.max(0, Math.min(20, Math.floor(n)));
}

class LaunchpadTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    const projects = getPinnedProjects();
    const activePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;

    return projects.map(p => {
      const item = new vscode.TreeItem(
        p.name,
        vscode.TreeItemCollapsibleState.None
      );
      item.description = p.path;
      item.tooltip = p.path;
      item.contextValue = 'launchpadProject';
      item.command = {
        command: 'launchpad.openProject',
        title: 'Open Project',
        arguments: [p.path]
      };

      if (p.path === activePath) {
        item.iconPath = new vscode.ThemeIcon('check');
      } else {
        item.iconPath = new vscode.ThemeIcon('folder');
      }

      return item;
    });
  }
}

function activate(context) {
  const provider = new LaunchpadViewProvider(context);
  const treeProvider = new LaunchpadTreeProvider();

  const statusSwitch = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusSwitch.text = '$(rocket) Launchpad';
  statusSwitch.tooltip = 'Switch project (Launchpad)';
  statusSwitch.command = 'launchpad.switchProject';
  statusSwitch.show();

  /** @type {vscode.Disposable[]} */
  let projectStatusDisposables = [];
  const refreshProjectStatusBar = () => {
    for (const d of projectStatusDisposables) d.dispose();
    projectStatusDisposables = [];

    const projects = getPinnedProjects();
    const maxItems = getStatusBarMaxItems();
    const activePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;

    // Show per-project one-click buttons. Keep the original "Projects" switcher too.
    for (let i = 0; i < Math.min(maxItems, projects.length); i++) {
      const p = projects[i];
      const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99 - i);
      const isActive = p.path === activePath;
      item.text = `${isActive ? '$(rocket)' : '$(folder)'} ${p.name}`;
      item.tooltip = `Open ${p.path}`;
      item.command = { command: 'launchpad.openProject', title: 'Open Project', arguments: [p.path] };
      item.show();
      projectStatusDisposables.push(item);
    }
  };
  refreshProjectStatusBar();

  context.subscriptions.push(
    statusSwitch,
    { dispose: () => projectStatusDisposables.forEach(d => d.dispose()) },
    vscode.window.registerWebviewViewProvider('launchpad.sidebarView', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),

    vscode.window.registerTreeDataProvider('launchpad.projectsTree', treeProvider),

    vscode.commands.registerCommand('launchpad.addProject', async () => {
      await addCurrentProject();
      provider.refresh();
      treeProvider.refresh();
      refreshProjectStatusBar();
    }),

    vscode.commands.registerCommand('launchpad.switchProject', async () => {
      await switchProjectQuickPick();
    }),

    vscode.commands.registerCommand('launchpad.focus', async () => {
      await focusProjectTabsView();
    }),

    vscode.commands.registerCommand('launchpad.openProject', async (path) => {
      if (!path) return;
      const uri = vscode.Uri.file(path);
      await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    }),

    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i =>
      vscode.commands.registerCommand(`launchpad.openProject${i}`, async () => {
        const projects = getPinnedProjects();
        if (projects[i - 1]) {
          const uri = vscode.Uri.file(projects[i - 1].path);
          await vscode.commands.executeCommand('vscode.openFolder', uri, false);
        }
      })
    ),

    vscode.commands.registerCommand('launchpad.removeProject', async () => {
      const config = vscode.workspace.getConfiguration('projectTabs');
      const projects = config.get('projects') || [];
      const picked = await vscode.window.showQuickPick(
        projects.map(p => ({ label: p.name, description: p.path, path: p.path })),
        { placeHolder: 'Select project to remove' }
      );
      if (!picked) return;
      const updated = projects.filter(p => p.path !== picked.path);
      await config.update('projects', updated, vscode.ConfigurationTarget.Global);
      provider.refresh();
      treeProvider.refresh();
      refreshProjectStatusBar();
    })
  );

  // Keep tree + webview in sync with config/workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('projectTabs.projects') ||
        e.affectsConfiguration('projectTabs.position') ||
        e.affectsConfiguration('projectTabs.statusBarMaxItems')
      ) {
        provider.refresh();
        treeProvider.refresh();
        refreshProjectStatusBar();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      provider.refresh();
      treeProvider.refresh();
      refreshProjectStatusBar();
    })
  );
}

function getHtml(projects, activePath, position) {
  const tabs = projects.map(p => {
    const isActive = p.path === activePath;
    const safePath = escapeJs(p.path);
    const safeName = escapeHtml(p.name);
    const shortPath = escapeHtml(p.path.replace(/\\/g, '/').split('/').slice(-2).join('/'));
    return `
      <div class="tab ${isActive ? 'active' : ''}" onclick="switchProject('${safePath}')" title="${escapeHtml(p.path)}">
        <div class="tab-left">
          <span class="dot ${isActive ? 'dot-active' : ''}"></span>
          <div class="tab-info">
            <span class="tab-name">${safeName}</span>
            <span class="tab-path">${shortPath}</span>
          </div>
        </div>
        <span class="tab-close" onclick="event.stopPropagation(); removeProject('${safePath}')" title="Unpin">✕</span>
      </div>`;
  }).join('');

  const empty = projects.length === 0 ? `
    <div class="empty">
      <div class="empty-icon">📂</div>
      <div>No projects pinned yet.</div>
      <div>Open a project and click<br><strong>Pin Current Project</strong></div>
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: transparent;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 10px 8px;
  }

  .add-btn {
    flex: 1;
    padding: 7px 12px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    justify-content: center;
    transition: opacity 0.15s;
  }
  .add-btn:hover { opacity: 0.85; }

  .pos {
    width: 84px;
    padding: 7px 8px;
    border: 1px solid var(--vscode-dropdown-border, transparent);
    border-radius: 5px;
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    font: inherit;
  }

  .divider {
    height: 1px;
    background: var(--vscode-panel-border);
    margin: 0 10px 8px;
  }

  .shell {
    flex: 1;
    padding: 0 8px 8px;
    min-height: 0;
    display: flex;
  }

  .tabs {
    flex: 1;
    display: flex;
    gap: 4px;
    min-width: 0;
    min-height: 0;
  }

  .pos-top .tabs {
    flex-direction: row;
    align-items: flex-start;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .pos-left .tabs,
  .pos-right .tabs {
    flex-direction: column;
    overflow-y: auto;
  }

  .tab {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid var(--vscode-panel-border);
    transition: all 0.12s;
    background: var(--vscode-editor-background);
    min-width: 0;
  }
  .tab:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }
  .tab.active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
    border-color: var(--vscode-focusBorder);
  }

  .pos-top .tab {
    min-width: 180px;
    max-width: 220px;
    flex: 0 0 auto;
    border-bottom-width: 2px;
  }

  .pos-left .tab.active { border-left-width: 3px; }
  .pos-right .tab.active { border-right-width: 3px; }
  .pos-top .tab.active { border-top-width: 3px; }

  .tab-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--vscode-descriptionForeground);
    flex-shrink: 0;
    opacity: 0.4;
  }
  .dot-active {
    background: #4ec9b0;
    opacity: 1;
  }

  .tab-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .tab-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab-path {
    font-size: 10px;
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab.active .tab-path { opacity: 0.7; }

  .tab-close {
    font-size: 11px;
    padding: 2px 5px;
    border-radius: 3px;
    opacity: 0;
    flex-shrink: 0;
    color: var(--vscode-foreground);
    transition: opacity 0.1s;
  }
  .tab:hover .tab-close { opacity: 0.5; }
  .tab-close:hover { opacity: 1 !important; background: rgba(255,80,80,0.2); }
  
  .footer {
    padding: 12px 10px;
    border-top: 1px solid var(--vscode-panel-border);
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .donate-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    background: #FFDD00;
    color: #000000;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .donate-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 221, 0, 0.3);
  }
  .donate-btn-icon { font-size: 14px; }

  .empty {
    text-align: center;
    padding: 30px 16px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.8;
  }
  .empty-icon { font-size: 28px; margin-bottom: 10px; }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="add-btn" onclick="addCurrent()">＋ Pin Current Project</button>
    <select class="pos" onchange="setPosition(this.value)">
      <option value="left" ${position === 'left' ? 'selected' : ''}>Left</option>
      <option value="top" ${position === 'top' ? 'selected' : ''}>Top</option>
      <option value="right" ${position === 'right' ? 'selected' : ''}>Right</option>
    </select>
  </div>
  <div class="divider"></div>
  <div class="shell pos-${position}">
    <div class="tabs">
      ${tabs}
      ${empty}
    </div>
  </div>
  <div class="footer">
    <a href="https://github.com/sponsors/JYashSakariyaJain" class="donate-btn">
      <span class="donate-btn-icon">❤️</span> Support Developer
    </a>
  </div>
<script>
  const vscode = acquireVsCodeApi();
  function switchProject(path) { vscode.postMessage({ command: 'switchProject', path }); }
  function addCurrent() { vscode.postMessage({ command: 'addCurrent' }); }
  function removeProject(path) { vscode.postMessage({ command: 'removeProject', path }); }
  function setPosition(position) { vscode.postMessage({ command: 'setPosition', position }); }
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeJs(s) {
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function deactivate() {}
module.exports = { activate, deactivate };
