# SampAI Frontend Prototype

Bus-only accessible journey-planning frontend built with React + Vite.

## Requirements

Install Node.js (LTS) first. Node.js includes npm.

## Run in VS Code

1. Open this `SampAI` folder in VS Code.
2. Open **Terminal > New Terminal**.
3. Run:

```bash
npm install
npm run dev
```

4. Open the localhost URL shown in the terminal (usually `http://localhost:5173`).

## Build test

```bash
npm run build
```

## Map integration

Your teammate should replace only the inside of:

`src/components/MapContainer.jsx`

Keep its props/callbacks or extend them as needed. The rest of the UI can stay separate.

## Libraries

Only these packages are used:

- React
- React DOM
- Vite
- @vitejs/plugin-react

There are no extra icon, CSS, map or chart libraries in this prototype.
