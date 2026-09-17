# Bin Monitor — Team TrashTalk

Web dashboard mockup for our CSC 131 smart campus waste bin monitoring project.
Tracks fill levels for "tribins" (trash / recycling / compost) across campus zones,
flags the fullest bin, shows live alerts, and includes an admin view for managing
staff and zone assignments.

## Getting started

```
pnpm install
pnpm dev
```

This starts a local dev server. Open the printed URL in your browser to view the dashboard.

## Build

```
pnpm build
```
## Project structure

- `src/App.tsx` — main dashboard component (bin cards, alerts panel, admin table)
- `src/index.css` — global styles and Tailwind theme (colors, fonts)
- `src/imports/logo.png` — Sac State Sustainability logo
- `index.html` — page shell

## Tech stack

- React 19
- Vite
- Tailwind CSS v4
- TypeScript

## Notes

This is currently mock data for the design mockup stage bin readings, alerts, and
staff list are hardcoded in `App.tsx` and will be replaced with real sensor data
once the backend is connected.
