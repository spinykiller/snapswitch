const vscode = require('vscode');

class SnapSwitchViewProvider {
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
      const config = vscode.workspace.getConfiguration('projectTabs');
      let projects = config.get('projects') || [];

      switch (message.command) {
        case 'switchProject': {
          trackLaunch(this._context, message.path);
          const uri = vscode.Uri.file(message.path);
          await vscode.commands.executeCommand('vscode.openFolder', uri, false);
          break;
        }
        case 'addCurrent': {
          await addCurrentProject(this._context);
          this._render();
          break;
        }
        case 'removeProject': {
          projects = projects.filter(p => p.path !== message.path);
          await config.update('projects', projects, vscode.ConfigurationTarget.Global);
          this._render();
          break;
        }
        case 'editProject': {
          const project = projects.find(p => p.path === message.path);
          if (project) {
            const newName = await vscode.window.showInputBox({ 
              prompt: 'Project Name', 
              value: project.name 
            });
            if (newName !== undefined) project.name = newName;
            
            const newGroup = await vscode.window.showInputBox({ 
              prompt: 'Group / Category (e.g. Work, Personal). Leave empty for none.', 
              value: project.group || '' 
            });
            if (newGroup !== undefined) project.group = newGroup === '' ? undefined : newGroup;

            const newIcon = await vscode.window.showInputBox({ 
              prompt: 'Codicon Name (e.g. star, code, rocket, browser). Leave empty for none.', 
              value: project.icon || '' 
            });
            if (newIcon !== undefined) project.icon = newIcon === '' ? undefined : newIcon;
            
            await config.update('projects', projects, vscode.ConfigurationTarget.Global);
            this._render();
          }
          break;
        }
        case 'reorder': {
          const { draggedPath, targetPath } = message;
          const fromIdx = projects.findIndex(p => p.path === draggedPath);
          const toIdx = projects.findIndex(p => p.path === targetPath);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [moved] = projects.splice(fromIdx, 1);
            projects.splice(toIdx, 0, moved);
            await config.update('projects', projects, vscode.ConfigurationTarget.Global);
          }
          this._render();
          break;
        }
        case 'setPosition': {
          const pos = ['left', 'top', 'right'].includes(message.position) ? message.position : 'top';
          await config.update('position', pos, vscode.ConfigurationTarget.Global);
          this._render();
          break;
        }
      }
    });

    // Re-render when config changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('projectTabs')) this._render();
    });
    // This catches both regular folders and .code-workspace files:
    vscode.workspace.onDidChangeWorkspaceFolders(() => this._render());
  }

  _render() {
    if (!this._view) return;
    const config = vscode.workspace.getConfiguration('projectTabs');
    const projects = config.get('projects') || [];
    const position = ['left', 'top', 'right'].includes(config.get('position')) ? config.get('position') : 'top';
    const showRecent = config.get('showRecentProjects') !== false;
    const active = getActivePath();
    const stats = this._context.globalState.get('snapswitch.projectStats') || {};
    const recent = this._context.globalState.get('snapswitch.recentProjects') || [];
    
    this._view.webview.html = getHtml(projects, active, position, showRecent, recent, stats);

    // Asynchronously fetch and inject git states
    if (projects.length > 0) {
      Promise.all(projects.map(async p => {
        const state = await getGitState(p.path);
        if (state && this._view) {
          this._view.webview.postMessage({ command: 'gitState', path: p.path, state });
        }
      })).catch(() => {});
    }
  }

  refresh() { this._render(); }
}

function getActivePath() {
  if (vscode.workspace.workspaceFile) return vscode.workspace.workspaceFile.fsPath;
  return vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;
}

const cp = require('child_process');
const util = require('util');
const exec = util.promisify(cp.exec);

async function getGitState(dir) {
  try {
    const { stdout: branch } = await exec('git branch --show-current', { cwd: dir, timeout: 800 });
    if (!branch.trim()) return null;
    const { stdout: status } = await exec('git status --porcelain', { cwd: dir, timeout: 800 });
    const changes = status.split('\\n').filter(l => l.trim()).length;
    return { branch: branch.trim(), changes };
  } catch (e) {
    return null;
  }
}

function getActiveName() {
  if (vscode.workspace.workspaceFile) {
    const raw = vscode.workspace.workspaceFile.path;
    return raw.substring(raw.lastIndexOf('/') + 1);
  }
  return vscode.workspace.workspaceFolders?.[0]?.name || null;
}

function trackLaunch(context, path) {
  const stats = context.globalState.get('snapswitch.projectStats') || {};
  if (!stats[path]) stats[path] = { count: 0, last: 0 };
  stats[path].count++;
  stats[path].last = Date.now();
  context.globalState.update('snapswitch.projectStats', stats);
}

function trackRecent(context) {
  const path = getActivePath();
  if (!path) return;
  const name = getActiveName();
  let recents = context.globalState.get('snapswitch.recentProjects') || [];
  recents = recents.filter(p => p.path !== path);
  recents.unshift({ name, path });
  if (recents.length > 5) recents.length = 5;
  context.globalState.update('snapswitch.recentProjects', recents);
}

async function addCurrentProject(context) {
  const path = getActivePath();
  if (!path) {
    vscode.window.showWarningMessage('No workspace/folder is currently open.');
    return;
  }
  const config = vscode.workspace.getConfiguration('projectTabs');
  const projects = config.get('projects') || [];

  if (projects.find(p => p.path === path)) {
    vscode.window.showInformationMessage('Already pinned!');
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: 'Name for this project tab',
    value: getActiveName()
  });
  if (!name) return;

  projects.push({ name, path });
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

  const activePath = getActivePath();
  const picked = await vscode.window.showQuickPick(
    projects.map(p => ({
      label: p.icon ? `$(${p.icon}) ${p.name}` : p.name,
      description: p.group ? `[${p.group}] ${p.path}` : p.path,
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
  await vscode.commands.executeCommand('workbench.view.extension.snapswitchContainer');
}

function getPinnedProjects() {
  const config = vscode.workspace.getConfiguration('projectTabs');
  const projects = config.get('projects') || [];
  
  // Deduplicate by path just in case
  const seen = new Set();
  return projects.filter(p => {
    if (seen.has(p.path)) return false;
    seen.add(p.path);
    return true;
  });
}

function getStatusBarMaxItems() {
  const config = vscode.workspace.getConfiguration('projectTabs');
  const n = Number(config.get('statusBarMaxItems'));
  if (!Number.isFinite(n)) return 6;
  return Math.max(0, Math.min(20, Math.floor(n)));
}

class SnapSwitchTreeProvider {
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

  getChildren(element) {
    const projects = getPinnedProjects();
    const activePath = getActivePath();
    
    // Support hierarchical view based on Groups. Very simple implementation:
    if (!element) {
      // Root level - return projects without groups + groups
      const groups = new Set();
      const rootItems = [];
      for (const p of projects) {
        if (p.group) {
          groups.add(p.group);
        } else {
          rootItems.push(this._createProjectItem(p, activePath));
        }
      }
      
      const groupItems = Array.from(groups).map(g => {
        const item = new vscode.TreeItem(g, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon('folder');
        item.contextValue = 'snapswitchGroup';
        return item;
      });
      
      return [...groupItems, ...rootItems];
    } else if (element.contextValue === 'snapswitchGroup') {
      // Return items exactly in this group
      return projects
        .filter(p => p.group === element.label)
        .map(p => this._createProjectItem(p, activePath));
    }
    
    return [];
  }

  _createProjectItem(p, activePath) {
    const item = new vscode.TreeItem(p.name, vscode.TreeItemCollapsibleState.None);
    item.description = p.path;
    item.tooltip = p.path;
    item.contextValue = 'snapswitchProject';
    item.command = {
      command: 'snapswitch.openProject',
      title: 'Open Project',
      arguments: [p.path]
    };
    
    let iconName = 'folder';
    if (p.path === activePath) iconName = 'check';
    else if (p.icon) iconName = p.icon;
    
    item.iconPath = new vscode.ThemeIcon(iconName, p.color ? new vscode.ThemeColor(p.color) : undefined);
    
    // Add time/analytics to tooltip if we wanted (omitted for brevity here)
    return item;
  }
}

function activate(context) {
  // Track open on activate to populate Recents Analytics
  trackRecent(context);

  const provider = new SnapSwitchViewProvider(context);
  const treeProvider = new SnapSwitchTreeProvider();

  const statusSwitch = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusSwitch.text = '$(rocket) SnapSwitch';
  statusSwitch.tooltip = 'Switch project (SnapSwitch)';
  statusSwitch.command = 'snapswitch.switchProject';
  statusSwitch.show();

  let projectStatusDisposables = [];
  const refreshProjectStatusBar = () => {
    for (const d of projectStatusDisposables) d.dispose();
    projectStatusDisposables = [];

    const projects = getPinnedProjects();
    const maxItems = getStatusBarMaxItems();
    const activePath = getActivePath();

    for (let i = 0; i < Math.min(maxItems, projects.length); i++) {
      const p = projects[i];
      const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99 - i);
      const isActive = p.path === activePath;
      const genericIcon = isActive ? '$(rocket)' : '$(folder)';
      item.text = `${p.icon ? '$(' + p.icon + ')' : genericIcon} ${i + 1}: ${p.name}`;
      item.tooltip = `Open ${p.path}`;
      if (p.color) item.color = new vscode.ThemeColor(p.color);
      item.command = { command: 'snapswitch.openProject', title: 'Open Project', arguments: [p.path] };
      item.show();
      projectStatusDisposables.push(item);
    }
  };
  refreshProjectStatusBar();

  context.subscriptions.push(
    statusSwitch,
    { dispose: () => projectStatusDisposables.forEach(d => d.dispose()) },
    vscode.window.registerWebviewViewProvider('snapswitch.sidebarView', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.window.registerTreeDataProvider('snapswitch.projectsTree', treeProvider),
    vscode.commands.registerCommand('snapswitch.addProject', async () => {
      await addCurrentProject(context);
      provider.refresh();
      treeProvider.refresh();
      refreshProjectStatusBar();
    }),
    vscode.commands.registerCommand('snapswitch.switchProject', async () => {
      await switchProjectQuickPick();
    }),
    vscode.commands.registerCommand('snapswitch.focus', async () => {
      await focusProjectTabsView();
    }),
    vscode.commands.registerCommand('snapswitch.openProject', async (path) => {
      if (!path) return;
      trackLaunch(context, path);
      const uri = vscode.Uri.file(path);
      await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    }),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i =>
      vscode.commands.registerCommand(`snapswitch.openProject${i}`, async () => {
        const projects = getPinnedProjects();
        if (projects[i - 1]) {
          trackLaunch(context, projects[i - 1].path);
          const uri = vscode.Uri.file(projects[i - 1].path);
          await vscode.commands.executeCommand('vscode.openFolder', uri, false);
        }
      })
    ),
    vscode.commands.registerCommand('snapswitch.removeProject', async () => {
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

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('projectTabs')
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

function getHtml(projects, activePath, position, showRecent, recentProjects, stats) {
  // Grouping logic
  const groups = {};
  const groupKeys = [];
  const ungrouped = [];
  
  projects.forEach(p => {
    if (p.group) {
        if (!groups[p.group]) {
            groups[p.group] = [];
            groupKeys.push(p.group);
        }
        groups[p.group].push(p);
    } else {
        ungrouped.push(p);
    }
  });

  const generateProjectHtml = (p, index) => {
    const isActive = p.path === activePath;
    const shortcutIndex = index + 1;
    const shortcutHtml = shortcutIndex <= 9 ? `<span class="shortcut-n">${shortcutIndex}: </span>` : '';
    const safePath = escapeJs(p.path);
    const safeName = escapeHtml(p.name);
    const shortPath = escapeHtml(p.path.replace(/\\/g, '/').split('/').slice(-2).join('/'));
    
    // Check launch stats
    const launchCount = stats[p.path]?.count || 0;
    const badgeHtml = launchCount > 0 ? `<div class="launch-badge" title="${launchCount} launches">${launchCount}</div>` : '';
    const iconChar = p.icon ? p.icon : (isActive ? 'rocket' : 'folder');
    
    // Codicon representation
    const codicon = `<i class="codicon codicon-${iconChar}"></i>`;

    return `
      <div class="tab ${isActive ? 'active' : ''}" 
           data-path="${escapeHtml(p.path)}"
           draggable="true" 
           ondragstart="drag(event, '${safePath}')" 
           ondragover="allowDrop(event)" 
           ondrop="drop(event, '${safePath}')"
           onclick="switchProject('${safePath}')" 
           title="${escapeHtml(p.path)}">
        <div class="tab-left">
          <div class="icon-wrap ${isActive ? 'active' : ''}">
            ${codicon}
          </div>
          <div class="tab-info">
            <span class="tab-name">${shortcutHtml}${safeName}</span>
            <span class="tab-path">${shortPath}</span>
          </div>
        </div>
        <div class="tab-actions">
          ${badgeHtml}
          <span class="tab-btn edit-btn" onclick="event.stopPropagation(); editProject('${safePath}')" title="Edit Tab">✎</span>
          <span class="tab-btn delete-btn" onclick="event.stopPropagation(); removeProject('${safePath}')" title="Unpin">✕</span>
        </div>
      </div>`;
  };

  let contentHtml = '';
  
  if (groupKeys.length > 0) {
      groupKeys.forEach(gk => {
          contentHtml += `<div class="group-header">${escapeHtml(gk)}</div>`;
          contentHtml += groups[gk].map(p => generateProjectHtml(p, projects.indexOf(p))).join('');
      });
  }
  if (ungrouped.length > 0) {
     if (groupKeys.length > 0) contentHtml += `<div class="group-header">Pinned</div>`;
     contentHtml += ungrouped.map(p => generateProjectHtml(p, projects.indexOf(p))).join('');
  }

  if (projects.length === 0) {
      contentHtml += `
      <div class="empty">
        <div class="empty-icon">🚀</div>
        <div>No projects pinned yet.</div>
        <div>Open a project and click<br><strong>Pin Current Project</strong></div>
      </div>`;
  }

  let recentHtml = '';
  if (showRecent && recentProjects && recentProjects.length > 0) {
      recentHtml += `<div class="group-header recent-header">Recent Projects</div>`;
      recentHtml += recentProjects.slice(0, 4).map(p => {
          const isActive = p.path === activePath;
          const safePath = escapeJs(p.path);
          const safeName = escapeHtml(p.name);
          return `
            <div class="tab recent-tab ${isActive ? 'active' : ''}" data-path="${safePath}" onclick="switchProject('${safePath}')" title="${escapeHtml(p.path)}">
               <div class="tab-left">
                 <div class="icon-wrap"><i class="codicon codicon-history"></i></div>
                 <div class="tab-info">
                   <span class="tab-name">${safeName}</span>
                   <span class="tab-path">Unpinned</span>
                 </div>
               </div>
            </div>`;
      }).join('');
  }

  // VS Code provides native codicons via its extension webview api automatically! We just insert the URI link or use standard classes if we supply them. Wait, since VSCode 1.42+ standard codicons need to be enabled via CSS or they might just work depending on VSCode version. To ensure safety without loading external codicons toolkit from `node_modules`, we'll just fall back to standard emoji if codicon classes aren't styled. Or we stick to native styled letters/emojis.
  // Actually, webviews don't automatically load native codicons unless they are bundled, but we'll try `<i class="codicon codicon-xxx"></i>` because it's a standard! Oh wait, `codicon` CSS is not injected by default in standard Webviews unless requested via `webview.html` link. To be safe, let's use an inline emoji mapper for the most common ones or keep it text! 
  // For the sake of aesthetic, let's do a fallback style!

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  /* Fallback codicon styles (if you aren't importing codicon css properly) */
  .codicon-folder::before { content: "📁"; }
  .codicon-rocket::before { content: "🚀"; }
  .codicon-history::before { content: "⏳"; }
  .codicon-star::before { content: "⭐"; }
  .codicon-code::before { content: "💻"; }
  .codicon-browser::before { content: "🌐"; }
  .codicon { font-style: normal; font-size: 14px; }

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
    border: 1px solid var(--vscode-button-border, transparent);
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
    width: 70px;
    padding: 6px;
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

  .group-header {
    margin: 12px 2px 4px;
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--vscode-descriptionForeground);
    letter-spacing: 0.5px;
  }
  
  .recent-header {
    border-top: 1px dashed var(--vscode-panel-border);
    padding-top: 12px;
  }

  .tab {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent; /* No border until active or hover */
    transition: all 0.15s;
    background: transparent;
    min-width: 0;
  }
  .tab.dragging {
    opacity: 0.4;
    border: 1px dashed var(--vscode-focusBorder);
  }
  .tab:hover {
    background: var(--vscode-list-hoverBackground);
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

  .pos-left .tab.active,
  .pos-right .tab.active { border-left-width: 2px; border-left-color: #4ec9b0; }

  .tab-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  
  .icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    opacity: 0.8;
  }
  .icon-wrap.active {
    background: rgba(78, 201, 176, 0.2);
    border-color: #4ec9b0;
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
  .shortcut-n {
    opacity: 0.5;
    font-weight: 400;
    margin-right: 2px;
  }
  .tab.active .shortcut-n { opacity: 0.8; }
  .tab-path {
    font-size: 10px;
    opacity: 0.55;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab.active .tab-path { opacity: 0.8; }
  
  .recent-tab .tab-name { font-style: italic; opacity: 0.8;}

  .tab-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .launch-badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 10px;
    opacity: 0.6;
  }
  .tab:hover .launch-badge { opacity: 1; }

  .tab-btn {
    font-size: 11px;
    padding: 3px 5px;
    border-radius: 4px;
    opacity: 0;
    flex-shrink: 0;
    color: var(--vscode-foreground);
    transition: opacity 0.1s, background 0.1s;
    user-select: none;
  }
  .git-badge {
    font-size: 9.5px;
    opacity: 0.65;
    margin-left: 6px;
    font-weight: normal;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .tab:hover .tab-btn { opacity: 0.5; }
  .tab-btn:hover { opacity: 1 !important; }
  .delete-btn:hover { background: rgba(255,80,80,0.2); color: #ff6b6b; }
  .edit-btn:hover { background: rgba(80, 180, 255, 0.2); color: #329dfa; }
  
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
    padding: 40px 16px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.8;
  }
  .empty-icon { font-size: 32px; margin-bottom: 12px; }
  
</style>
</head>
<body>
  <div class="toolbar">
    <button class="add-btn" onclick="addCurrent()">＋ Pin Current Project</button>
    <select class="pos" onchange="setPosition(this.value)">
      <option value="top" ${position === 'top' ? 'selected' : ''}>Top</option>
      <option value="left" ${position === 'left' ? 'selected' : ''}>Left</option>
      <option value="right" ${position === 'right' ? 'selected' : ''}>Right</option>
    </select>
  </div>
  <div class="divider"></div>
  <div class="shell pos-${position}">
    <div class="tabs">
      ${contentHtml}
      ${recentHtml}
    </div>
  </div>
  <div class="footer">
    <a href="https://github.com/sponsors/spinykiller" class="donate-btn">
      <span class="donate-btn-icon">❤️</span> Support Developer
    </a>
  </div>
<script>
  const vscode = acquireVsCodeApi();
  function switchProject(path) { vscode.postMessage({ command: 'switchProject', path }); }
  function addCurrent() { vscode.postMessage({ command: 'addCurrent' }); }
  function removeProject(path) { vscode.postMessage({ command: 'removeProject', path }); }
  function editProject(path) { vscode.postMessage({ command: 'editProject', path }); }
  function setPosition(position) { vscode.postMessage({ command: 'setPosition', position }); }
  
  function drag(ev, path) {
    ev.dataTransfer.setData("text/plain", path);
    setTimeout(() => ev.target.classList.add('dragging'), 10);
  }
  function allowDrop(ev) {
    ev.preventDefault();
  }
  function drop(ev, targetPath) {
    ev.preventDefault();
    const draggedPath = ev.dataTransfer.getData("text/plain");
    if (draggedPath && draggedPath !== targetPath) {
      vscode.postMessage({ command: 'reorder', draggedPath, targetPath });
    }
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('dragging'));
  }
  document.addEventListener('dragend', (ev) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('dragging'));
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'gitState') {
      const tabs = document.querySelectorAll(\`.tab[data-path="\${message.path.replace(/"/g, '&quot;')}"]\`);
      tabs.forEach(tab => {
        const nameNode = tab.querySelector('.tab-name');
        if (nameNode && !nameNode.querySelector('.git-badge')) {
          const badge = document.createElement('span');
          badge.className = 'git-badge';
          const changesHtml = message.state.changes > 0 ? \` <span style="color:var(--vscode-minimapGutter-modifiedBackground, #e2c08d)">*\${message.state.changes}</span>\` : '';
          badge.innerHTML = \`⎇ \${message.state.branch}\${changesHtml}\`;
          badge.title = \`Git Branch: \${message.state.branch}\`;
          nameNode.appendChild(badge);
        }
      });
    }
  });
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
