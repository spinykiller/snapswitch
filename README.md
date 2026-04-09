# SnapSwitch for VS Code

One-click project switching for VS Code — launch into your full project context instantly.

## Features

- One-click project switching from the Status Bar
- **Keyboard Shortcuts**: Switch between projects instantly with `Cmd + 1-9`
- Activity Bar view for managing pinned projects
- Optional tree view (“Pinned Projects”) that you can move to the Secondary Side Bar (right)

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
