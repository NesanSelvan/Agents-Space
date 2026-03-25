# Agents Space

Infinite canvas workspace for AI agents — a lightweight desktop app built with Electron, React, and TypeScript.

![App Icon](resources/icon.png)

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm (comes with Node.js)
- Git

## Installation

### macOS

```bash
git clone https://github.com/NesanSelvan/Agent-Space.git
cd Agent-Space
npm install
npm run dev
```

To build a `.dmg` installer:

```bash
npm run package:mac
```

The installer will be in the `dist/` folder.

### Windows

```bash
git clone https://github.com/NesanSelvan/Agent-Space.git
cd Agent-Space
npm install
npm run dev
```

To build a Windows `.exe` installer:

```bash
npm run package:win
```

The installer will be in the `dist/` folder.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Build the app for production |
| `npm run package:mac` | Package as macOS `.dmg` |
| `npm run package:win` | Package as Windows `.exe` (NSIS) |

## Tech Stack

- **Electron** — Desktop shell
- **React** — UI framework
- **TypeScript** — Type safety
- **Tailwind CSS** — Styling
- **Monaco Editor** — Code editing
- **xterm.js** — Integrated terminal
- **Zustand** — State management
