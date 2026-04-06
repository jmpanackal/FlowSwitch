# FlowSwitch

**FlowSwitch** is a desktop productivity launcher that helps you instantly switch between work, gaming, or creative contexts by launching apps, opening browser tabs, setting system volume, and more — all from a single profile.

Built with **Electron**, **React**, **TypeScript**, **Vite**, and **Tailwind CSS**.

---

## 🧰 Tech Stack

- **Electron** – Desktop application shell
- **React + TypeScript** – UI layer with type safety
- **Vite** – Fast frontend dev/build tool
- **Tailwind CSS** – Utility-first styling
- **IPC** – Electron's `ipcMain` and `ipcRenderer` for communication
- **contextBridge** – Exposes secure APIs via `window.electron`
- **JSON Profiles** – Simulated data loading (SQLite coming soon)

---

## ✅ Current Features

- React frontend displays live profile data
- Button triggers profile loading via `window.electron.launchProfile(...)`
- Preload bridge safely connects renderer to Electron main process
- Electron loads mock profile from a JSON file
- Profile is sent back to React and rendered (icon, name, tags, volume, action count)
- GPU acceleration disabled to prevent known Electron crashes

---

## 🧪 Local Development

### Prerequisites

- Node.js v18+
- Git

### Clone and install

```bash
git clone https://github.com/jmpanackal/FlowSwitch.git
cd FlowSwitch
npm install
```

### Project Structure

```bash
src/
├── main/                 # Electron backend logic
│   └── main.js
├── renderer/             # React frontend
│   └── App.tsx
├── types/
│   └── profile.ts        # Shared Profile & Action types
├── preload.js            # Exposes Electron APIs to frontend securely
```

### Run Commands

```bash
npm run build         # Build frontend for production
npm run dev           # Full dev (frontend + Electron)
npm run dev:frontend  # Vite frontend only
npm run dev:electron  # Electron only
```
