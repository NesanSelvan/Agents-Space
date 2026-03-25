# Agents Space

Infinite canvas workspace for AI agents — a lightweight desktop app built with Electron, React, and TypeScript.

![App Icon](resources/icon.png)

## Install

### macOS

```bash
curl -fsSL https://raw.githubusercontent.com/NesanSelvan/Agents-Space/main/install.sh | bash
```

### Windows (Git Bash / PowerShell)

```bash
curl -fsSL https://raw.githubusercontent.com/NesanSelvan/Agents-Space/main/install.sh | bash
```

Or download the latest `.exe` installer directly from [Releases](https://github.com/NesanSelvan/Agents-Space/releases/latest).

## Build from Source

Requires [Node.js](https://nodejs.org/) v18+ and npm.

```bash
git clone https://github.com/NesanSelvan/Agents-Space.git
cd Agents-Space
npm install
```

| Command | Description |
|---|---|
| `npm run dev` | Start in development mode |
| `npm run build` | Build for production |
| `npm run package:mac` | Package as macOS `.dmg` |
| `npm run package:win` | Package as Windows `.exe` |

## Tech Stack

- **Electron** — Desktop shell
- **React** — UI framework
- **TypeScript** — Type safety
- **Tailwind CSS** — Styling
- **Monaco Editor** — Code editing
- **xterm.js** — Integrated terminal
- **Zustand** — State management
