# Roadmap & Future Requirements

This document outlines the planned features and improvements for **SnapSwitch**.



## ✅ Recently Implemented

### ⌨️ Project Switching Shortcuts
- **Status**: Completed in v1.0.0
- **Feature**: Full support for `Cmd + <Number>` (macOS) and `Ctrl + <Number>` (Windows/Linux).
- **Usage**:
  - `Cmd+1` switches to project 1, `Cmd+2` to project 2, etc.
  - Supports slots 1 through 9.

### 💰 Monetization & Support
- **Status**: Completed in v1.0.0
- **Feature**: Added a premium-styled "Support Developer" button to the Dashboard sidebar.
- **Link**: [GitHub Sponsors](https://github.com/sponsors/JYashSakariyaJain)

---

## 🚀 Upcoming Features

- [x] **Drag-and-Drop Reordering**: Allow users to manually sort their pinned projects via the sidebar.
- [x] **Project Auto-Detection**: Automatically show the most used folders even if not pinned.
- [x] **Custom Icons**: Allow users to assign specific colors or icons to project tabs for visual grouping.
- [ ] **State Restoration**: Option to restore exact open files when switching projects.
- [x] **Workspace Support**: Enhanced native support for `.code-workspace` multi-root workspace files.
- [x] **Project Grouping / Tags**: Organize projects into custom folders or tags (e.g., 'Work', 'Personal') in the SnapSwitch sidebar.
- [x] **Git State Indicators**: Display the active Git branch and an uncommitted changes indicator directly on the SnapSwitch project UI.
- [x] **Recent Projects Section**: An automated "Recently opened" list adjacent to pinned projects, simplifying the discovery of new projects.
- [x] **Analytics & Time Tracking**: Small visual metrics indicating how frequently a project is launched or how much time is spent in it.

---

## 🛠️ Performance & Internal Goals
- [x] Optimize webview rendering for large lists (>20 projects).
- [ ] Improve focus detection when switching folders to ensure the sidebar stays responsive.
- [ ] Improve global state management and cross-window sync mechanisms for pinned projects.
