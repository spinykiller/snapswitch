# SnapSwitch for VS Code

One-click project switching for VS Code — launch into your full project context instantly.

## Features

- **One-click status bar buttons** with prepended shortcuts (e.g. `1: Project`)
- **Keyboard Shortcuts**: Switch between projects instantly with `Cmd + 1-9`
- **Drag-and-Drop Sidebar Dashboard**: Manage, edit, and reorganize projects smoothly!
- **Git State Indicators**: Live Git branch & uncommitted changes directly on UI badges
- **Customization & Grouping**: Tag your projects under sub-folders or assign dynamic Codicons!
- **Extended Workspace Syncing**: `.code-workspace` native support along with Analytics and Auto-Recent project logs.

## Install (Local / Dev)

1. Package a VSIX:

```bash
npx --yes vsce package --no-dependencies
```

2. Install the generated `.vsix` in VS Code:

- Command Palette → **Extensions: Install from VSIX...**

## Usage

| Action | How |
|---|---|
| Pin current project | Command Palette → **SnapSwitch: Pin Current Project** |
| Switch project (one click) | Click a project button in the Status Bar |
| Switch project (shortcut) | **Cmd + <Number>** (1-9) for pinned projects |
| Switch project (picker) | Command Palette → **SnapSwitch: Switch Project** |
| Switch project (side bar) | Open **Pinned Projects** view and click a project |

## Support & Donation

If you find SnapSwitch useful, consider supporting the development:
- [GitHub Sponsors](https://github.com/sponsors/spinykiller)
- [Support via Sidebar Dashboard]

## How It Works

Projects are saved globally in VS Code settings (`projectTabs.projects`).  
Clicking a tab runs `vscode.openFolder` — same as File → Open Folder — switching full context.

## Settings

- `projectTabs.statusBarMaxItems`: number of pinned projects to show as one-click Status Bar buttons (0–20)
