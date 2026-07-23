# 🏙️ Mobile Open-World 3D Game

A mobile-optimized, GTA-style open-world 3D game, built in **5 modular parts**.

> **Status: Part 4 — Combat, Police & Missions ✅**
> Parts 1 (Core & World) ✅ · 2 (Locomotion & Driving) ✅ · 3 (NPCs & Traffic
> AI) ✅ · Part 5 (Polish, Audio & Final Build) is not started yet.

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

A red capsule stands in as the **placeholder player**. An on-screen HUD shows
FPS, quality tier, loaded chunk count and position so you can verify
performance.

---

## 🚗 What Part 2 delivers

Built directly on the Part 1 architecture (same Three.js + Vite stack, same
engine/camera/streaming — nothing was replaced, only extended):

- **Character locomotion** (`src/entities/Player.js`) — a real IDLE → WALK →
  RUN state machine driven by the Part 1 joystick. Push the stick a little to
  walk, all the way to run; speed ramps smoothly and a procedural bob + lean
  makes each state visible (drop-in point for real animation clips later).
- **Arcade vehicle physics** (`src/entities/Vehicle.js`) — a stable,
  mobile-tuned driving model: acceleration, braking, reverse, speed-scaled
  steering, and **drift** (brake hard while turning at speed → the car slides,
  then grip recovers smoothly). Includes a signed km/h speedometer.
- **Seamless enter/exit** (`Game.js` + `VehicleManager.js`) — walk up to a
  parked car, an **ENTER** prompt appears; tapping it hides the character,
  reframes and trails the camera behind the car, and swaps the on-screen
  controls. **EXIT** drops you back beside the driver door.
- **Driving touch UI** (`src/controls/DrivingControls.js`) — thumb-friendly
  **GAS**, **BRAKE/REVERSE**, **◀ ▶ steering**, **HORN** (synthesized beep) and
  **EXIT** buttons, all true multi-touch (gas + steer + horn together).

Three demo cars are parked near spawn. The HUD now also shows the current mode
(ON FOOT + locomotion state, or DRIVING + km/h + a DRIFT! indicator).

## 🚦 What Part 3 delivers

Same Three.js + Vite codebase — the city now feels alive, and two Part 2 bugs
are fixed:

- **🐛 Fixed: cars drove through buildings.** A cheap circle-vs-AABB
  **collision system** (`src/world/CollisionSystem.js`) now stops the player
  and car at walls; each building's footprint is registered as it streams in
  and dropped as it streams out, so collision only ever tests loaded geometry.
- **🐛 Fixed: steering was mirrored.** Right now turns right, left turns left.

New ambient-AI systems (all pooled + culled for mobile):

- **Pedestrian crowd** (`src/ai/Pedestrian*.js`) — object-pooled NPCs that walk
  sidewalk waypoints, idle, and change direction naturally. They **panic and
  flee** when a fast car drives near or you sound the horn.
- **Autonomous traffic** (`src/ai/Traffic*.js`, `RoadNetwork.js`) — AI cars
  drive the road grid lane-by-lane and use **distance/corridor sensing** to
  stop for each other, the player, and pedestrians (no crashing through them).
- **Density & performance manager** — hard caps per quality tier (Low 8 NPCs /
  4 cars → High 20 NPCs / 10 cars), a spawn/despawn ring around the player, and
  **off-screen culling** that pauses the AI of anything far and outside the
  camera frustum so it costs zero CPU. The HUD shows live NPC/car counts.

## 🔫 What Part 4 delivers

Same Three.js + Vite codebase. Two reported issues fixed, plus the full
action/police layer:

- **🐛 Fixed: cars/people were non-solid.** New moving-body collision
  (`src/core/PhysicsInteractions.js`): car↔car **crashes** (both stop/scrape),
  the player no longer walks through cars, and **running someone over hurts
  them** — a light/side hit **injures** (they limp), a fast or head-on hit
  **kills** them (they collapse, then despawn).
- **Weapons & combat** (`src/combat/WeaponSystem.js`) — Fists / Pistol /
  Assault Rifle with a **WPN** switch button and a **FIRE** button (hold to
  spray the rifle). Assisted-aim raycast with **muzzle flash + bullet tracer**
  and ammo counts. NPCs take damage and die.
- **Wanted system** (`src/core/WantedSystem.js`) — a **1–5 star** meter; crimes
  (hitting/killing people, shooting, stealing cars) add heat that cools over
  time when you lie low.
- **Police AI** (`src/police/*`) — at 1+ stars, cops and cruisers spawn and
  **chase + shoot** you; more stars = bigger response. Cops are NPCs too, so
  you can fight back.
- **Wasted / Busted** (`src/ui/Screens.js`) — health 0 → **WASTED**; cornered
  by police → **BUSTED** (lose 25% cash). A **Respawn** button returns you to a
  safe point with the heat cleared.
- **Starter mission** (`src/missions/MissionManager.js`) — a glowing **beacon**
  marks a car to steal; steal it, drive to the drop-off beacon, earn **$500**.
- **Top HUD** (`src/ui/HUD.js`) — health & armor bars, cash, weapon + ammo,
  wanted stars, and the live mission objective + distance.

### How to test Part 4
1. **Mission:** follow the yellow beacon to the marked car, steal it, drive to
   the second beacon → cash reward (watch the HUD objective + distance).
2. **Combat:** on foot, tap **WPN** to pick Pistol/Rifle, aim by facing an NPC,
   hold/tap **FIRE** — see the tracer + muzzle flash; NPCs take damage & die.
3. **Damage model:** clip a pedestrian slowly with a car (they limp / injured);
   hit one at speed or run them over (they die).
4. **Wanted + police:** commit crimes → stars appear → cops chase and shoot.
   Fight or flee. Let them corner you → **BUSTED**; lose all health → **WASTED**;
   then **Respawn**.

### How to test Part 3
1. Open the game. Walk or drive around — sidewalks fill with pedestrians and
   the roads with moving traffic (watch the HUD **NPCs/Cars** counts).
2. **Collision:** drive straight at a building — the car now stops/scrapes
   instead of passing through. Try walking into one too.
3. **Steering:** confirm right = right, left = left.
4. **Panic:** drive fast at a crowd, or press **HORN** near people — they run.
5. **Traffic sense:** drive slowly in front of an AI car — it stops and waits.

### How to test Part 2
1. `npm run dev`, open on a phone (or use the mouse on desktop).
2. **On foot:** small joystick push = walk, full push = run (watch the HUD
   state change). Walk up to a car until **ENTER** appears.
3. **Enter & drive:** tap ENTER. Hold **GAS**, steer with **◀ ▶**, tap **HORN**.
   Get up to speed, then hold **BRAKE** while steering to feel the **drift**.
   Press **BRAKE** from a standstill to **reverse**.
4. **Exit:** tap **EXIT** — you step out beside the car and controls switch
   back to on-foot.

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
│   ├── Audio.js                # WebAudio helper (car horn) [Part 2]
│   ├── PhysicsInteractions.js  # Moving-body collisions + run-over damage [P4]
│   ├── PlayerStats.js          # Health/armor/cash/ammo/respawn [Part 4]
│   ├── WantedSystem.js         # 1–5 star wanted meter [Part 4]
│   └── Game.js                 # Subsystem wiring, main loop, mode switching
├── world/
│   ├── World.js                # World façade (streaming + collision)
│   ├── ChunkManager.js         # Streaming: load/unload + frame budget
│   ├── CollisionSystem.js      # Circle-vs-building collision [Part 3]
│   └── Chunk.js                # One tile: ground, roads, buildings (+colliders)
├── ai/                          # Ambient life [Part 3]
│   ├── RoadNetwork.js          # Implicit road grid: lanes + sidewalks
│   ├── Pedestrian.js           # One NPC (walk/idle/flee/injured/dead) [+P4]
│   ├── PedestrianManager.js    # Pooled crowd + spawn ring + culling
│   ├── TrafficCar.js           # One AI car (waypoint driving, +chase) [+P4]
│   └── TrafficManager.js       # Pooled traffic + anti-collision + culling
├── combat/                      # [Part 4]
│   └── WeaponSystem.js         # Weapons, assisted-aim firing, tracers, ammo
├── police/                      # [Part 4]
│   ├── PoliceOfficer.js        # Cop on foot (extends Pedestrian): chase+shoot
│   ├── PoliceCar.js            # Cruiser (extends TrafficCar): chases player
│   └── PoliceManager.js        # Wanted-scaled spawns + busted logic
├── missions/                    # [Part 4]
│   └── MissionManager.js       # Beacon marker + starter mission flow
├── ui/                          # [Part 4]
│   ├── HUD.js                  # Health/armor/cash/ammo/stars/objective
│   └── Screens.js              # Wasted / Busted + respawn
├── camera/
│   └── ThirdPersonCamera.js    # GTA-style follow cam (+ driving follow) 
├── controls/
│   ├── TouchControls.js        # On-foot pointer router (move zone / look zone)
│   ├── VirtualJoystick.js      # Floating on-screen joystick
│   ├── DrivingControls.js      # Driving HUD: gas/brake/steer/horn/exit [Part 2]
│   └── ActionPrompt.js         # Contextual ENTER button [Part 2]
└── entities/
    ├── Player.js               # Character locomotion (idle/walk/run) [Part 2]
    ├── Vehicle.js              # Arcade car physics [Part 2]
    └── VehicleManager.js       # Car spawning + nearest-car lookup [Part 2]
```

---

## 🛣️ Roadmap
1. **Part 1 — Core Architecture & World Setup** ✅ *(this)*
2. Part 2 — Player & Vehicles
3. Part 3 — AI, Pedestrians & Traffic
4. Part 4 — Missions, Economy & UI
5. Part 5 — Polish, Audio & Optimization
