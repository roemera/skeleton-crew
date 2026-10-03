# Skeleton Crew

A browser tank game where you are the whole crew: driver, gunner, loader and lookout, one seat at a time.
Switching seats takes 2 seconds. Design doc: https://claude.ai/code/artifact/6ed43f7e-4ee7-4297-b6c4-ff1759a31cf7

Stack: TypeScript, Three.js, Rapier (WebAssembly physics), Vite. Everything (map, models, textures) is generated in code.

## Run

```
npm install
npm run dev        # http://localhost:5173
```

Options: `?seed=123` picks a different map; `?test` hides the click-to-play panel (for headless checks).

## Controls

| Seat | Controls |
| --- | --- |
| Any | 1 Driver, 2 Gunner, 3 Loader, 4 Lookout (2 s crawl, you control nothing meanwhile) |
| Driver | W/S throttle lever (R full, R 1/2, stop, 1/4, 1/2, full), A/D steering lever, X centre, Space brake (held) |
| Gunner | Mouse aims (turret follows at 24 deg/s), right click 2x/4x zoom, Shift fine aim |
| Loader | Free cursor. Drag-to-load arrives in milestone 2 |
| Lookout | Mouse look, hold right click for 6x binoculars |

Levers stay where you leave them, so the tank keeps driving while you are in another seat.

## Layout

```
packages/
  shared/   constants.ts (tuning), mapgen.ts (seeded map), rng.ts
  client/   main.ts (loop), sim/tank.ts (physics), seats/, ui/ (HUD, bitmap font),
            render/ (low-res pipeline, vertex wobble, textures), models/, world.ts
```

## Status

Milestone 1 (offline driving and seats) is done. Next: milestone 2, shooting and loading.
