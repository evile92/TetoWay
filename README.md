# TetoWay — Tetouan Public Transit Platform

Interactive, 100% static and serverless-friendly public transit web application for **Tetouan, Morocco** and its surrounding region (Martil, M'diq, Fnideq, Oued Laou, Azla, Amsa, Ain Lahcen, Dar Ben Karrich, and more).

## Features

- **31 Road-Snapped Bus Lines:** Complete Urban (21 lines) and Regional/Suburban (10 lines) network generated via OSRM routing geometries and verified hub coordinates.
- **OpenStreetMap Integration:** 553 OSM bus stop points (`public/data/osm-stops.json`) with interactive stop popups showing nearby connecting lines.
- **Dual Theme (Day & Night):**
  - **Day Mode:** CartoDB Voyager light tiles paired with a Medina-white and coastal slate palette.
  - **Night Mode:** CartoDB Dark Matter tiles paired with deep Tetouan marine navy surfaces and Rif emerald accents.
- **Strict English (`LTR`) & Arabic (`RTL`) BiDi Support:** Clean separation between [en.json](./src/i18n/en.json) and [ar.json](./src/i18n/ar.json) using standard Western numerals (`0-9`) throughout.
- **Interactive Trip Planner:** "Nearest bus stop" (GPS or click-on-map) and A-to-B itinerary routing (direct and 1-transfer hub options) powered by Turf.js.
- **Route Studio (Editor):** Drag stop pins, add/reorder stops, edit bilingual stop names, re-snap street geometries live via OSRM, and export updated JSON (`tetouan-lines.json`).
- **Responsive Layout:** Desktop sidebar + full-screen map view, and a collapsible mobile bottom sheet for on-the-go riders.

## Tech Stack

- React 19 + TypeScript + Vite 8
- Tailwind CSS v4
- MapLibre GL JS 6
- Turf.js (`@turf/turf`)
- Lucide Icons (`lucide-react`)

## Local Development

```bash
npm install
npm run generate:data
npm run dev
```

## Build & Verification

```bash
npm run lint
npm run build
```

## Deployment (Vercel)

Configured via [`vercel.json`](./vercel.json) (`vite` framework, outputs to `dist/`, no environment keys required).
