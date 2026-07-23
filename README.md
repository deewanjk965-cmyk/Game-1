# 🏙️ Mobile Open-World 3D Game

A mobile-optimized, GTA-style open-world 3D game, built in **5 modular parts**.

> **Status: Part 1 — Core Architecture & World Setup ✅**
> Parts 2–5 (Player & Vehicles, AI & Traffic, Missions & UI, Polish &
> Optimization) are not started yet.

---

## 🧰 Tech Stack Choice — and why

| Choice | Reason |
| --- | --- |
| **Three.js (WebGL)** | A thin, tree-shakeable 3D layer — no heavy editor/runtime. It gives us full manual control over draw calls, LOD and memory, which is exactly what an open world on a phone needs. |
| **Plain JavaScript (ES modules)** | Zero runtime overhead, instant iteration, runs on every phone's browser. No transpiler weight. |
| **Vite** | Near-instant dev server + hot reload, and small production bundles with the three.js core split into its own cacheable chunk. |
| **WebGL delivery (web-first)** | One codebase runs on Android **and** iOS with no app-store friction, and can later be wrapped as a native app with **Capacitor** if desired. |

**Why not Unity / Unreal / Godot?** Those ship a large runtime and are heavier
to stream and control at the byte level. For a *lightweight, mobile-first*
open world where memory is the main constraint, a hand-tuned Three.js pipeline
lets us keep only what we need in memory and nothing else.

### The three mobile-performance pillars in Part 1
1. **Quality tiers** (`src/core/Config.js`) — the engine auto-detects the
   device and scales pixel ratio, view distance and shadows accordingly.
2. **Chunk streaming** (`src/world/`) — only a small grid of chunks around the
   player is ever in memory; the rest is loaded/unloaded on the fly with a
   per-frame build budget so streaming never stutters.
3. **Shared resources** — geometries and materials are created once and reused
   across every chunk, keeping GPU memory tiny.

---

## 🗺️ What Part 1 delivers

- **Core architecture** — a clean, decoupled engine (`Engine` → renderer/scene/
  lights, `Game` → main loop and wiring, `Config` → all tunables).
- **World / chunk streaming** — `ChunkManager` loads chunks around the player,
  unloads distant ones (with hysteresis to avoid thrashing), and spreads chunk
  building across frames. Each chunk currently shows a ground plane, a cross
  road and a few placeholder buildings so you can *see* streaming working.
- **3rd-person mobile camera** — `ThirdPersonCamera`, a smooth GTA-style follow
  camera you orbit by dragging and zoom by pinching.
- **Mobile touch controls** — a floating left-thumb **virtual joystick** for
  movement and a right-thumb **drag-to-look / pinch-to-zoom** camera zone,
  built on unified Pointer Events (so a mouse also works for desktop testing).

A red capsule stands in as the **placeholder player** (the real character +
physics arrive in Part 2). An on-screen HUD shows FPS, quality tier, loaded
chunk count and position so you can verify performance.

---

## ▶️ How to run & test

```bash
npm install
npm run dev
```

Then:
- **On desktop:** open the printed `http://localhost:5173` URL. Use the mouse —
  drag the **left half** to move, drag the **right half** to look.
- **On your phone (recommended):** make sure the phone is on the same Wi-Fi,
  then open the **Network** URL Vite prints (e.g. `http://192.168.x.x:5173`).
  - **Left thumb:** touch-and-drag anywhere on the left half → move.
  - **Right thumb:** drag on the right half → rotate the camera.
  - **Two fingers:** pinch → zoom the camera in/out.

### What to check
- The capsule moves in the direction you push the joystick, relative to camera.
- Buildings **stream in ahead of you** and **unload behind you** as you walk —
  watch the "Chunks loaded" number stay roughly constant.
- The camera follows smoothly and orbits/zooms with touch.
- FPS stays high on your device (tweak the tier in `main.js` if needed).

---

## 📁 Project structure

```
src/
├── main.js                     # Entry point
├── core/
│   ├── Config.js               # Quality tiers + world constants + auto-detect
│   ├── Engine.js               # Renderer, scene, lights, resize
│   └── Game.js                 # Subsystem wiring + main loop
├── world/
│   ├── World.js                # World façade (room for weather/time later)
│   ├── ChunkManager.js         # Streaming: load/unload + frame budget
│   └── Chunk.js                # One tile: ground, roads, placeholder buildings
├── camera/
│   └── ThirdPersonCamera.js    # GTA-style follow camera
├── controls/
│   ├── TouchControls.js        # Pointer-event router (move zone / look zone)
│   └── VirtualJoystick.js      # Floating on-screen joystick
└── entities/
    └── Player.js               # Placeholder capsule (real player = Part 2)
```

---

## 🛣️ Roadmap
1. **Part 1 — Core Architecture & World Setup** ✅ *(this)*
2. Part 2 — Player & Vehicles
3. Part 3 — AI, Pedestrians & Traffic
4. Part 4 — Missions, Economy & UI
5. Part 5 — Polish, Audio & Optimization
