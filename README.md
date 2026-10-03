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
| Gunner | Mouse aims (turret follows at 24 deg/s), left click fires, right click 2x/4x zoom, Shift fine aim |
| Loader | Free cursor: drag a shell from the rack into the open breech, Space opens/closes the breech |
| Lookout | Mouse look, hold right click for 6x binoculars |

Levers stay where you leave them, so the tank keeps driving while you are in another seat.

Firing opens the breech and empties it. Someone (you) has to crawl to the loader seat, drag a shell in
and close the breech before the gun is ready again. The rack holds 6 and refills from storage (30)
at one shell every 4 s.

Dev key: F8 breaks a random part on your own tank, to see its effect.

## Sound

All sounds are generated in code (no files), low sample rate and bitcrushed. Outside sounds are
positional (HRTF): you can hear where an engine or explosion is. They arrive late with distance
(speed of sound) and are muffled while you are inside the tank; put your head out as lookout to
hear clearly. Click or press a key once to start audio (browser rule).

## Layout

```
packages/
  shared/   constants.ts (tuning), mapgen.ts (seeded map), rng.ts
  shared/   hitzones.ts (damage table, TankDamage)
  client/   main.ts (loop), sim/tank.ts (physics), sim/gun.ts (breech, rack), sim/shells.ts (ballistics),
            seats/, ui/ (HUD, loader station, bitmap font), render/ (low-res pipeline, vertex wobble,
            textures), models/, world.ts, targets.ts (practice tanks), fx.ts, audio.ts
```

## Status

- Milestone 1 (offline driving and seats): done.
- Milestone 2 (offline shooting and loading, directional sound): done. Four practice tanks sit ahead
  of the spawn; one drives in circles.
- Next: milestone 3, the server and networked movement.
