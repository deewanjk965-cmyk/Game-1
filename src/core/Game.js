/**
 * Game.js
 * -------
 * The orchestrator. It wires together the engine, world streaming, player,
 * vehicles, camera and input, and runs the main loop.
 *
 * PART 2 adds a **mode system**. The game is always in one of two modes:
 *
 *   'character' : on foot — joystick moves the player, drag looks, an ENTER
 *                 prompt appears near cars.
 *   'vehicle'   : driving — the driving HUD (gas/brake/steer/horn/exit) drives
 *                 the car, the camera trails behind it, the player is hidden.
 *
 * `enterVehicle()` / `exitVehicle()` swap the active entity, the camera framing
 * and the on-screen controls in one place, so the rest of the code never has to
 * branch on mode beyond the loop below.
 */

import * as THREE from 'three';
import { Engine } from './Engine.js';
import { AudioManager } from './AudioManager.js';
import { World } from '../world/World.js';
import { DayNightCycle } from '../world/DayNightCycle.js';
import { Player } from '../entities/Player.js';
import { VehicleManager } from '../entities/VehicleManager.js';
import { Helicopter } from '../entities/Helicopter.js';
import { FlightControls } from '../controls/FlightControls.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { TouchControls } from '../controls/TouchControls.js';
import { DrivingControls } from '../controls/DrivingControls.js';
import { ActionPrompt } from '../controls/ActionPrompt.js';
import { RoadNetwork } from '../ai/RoadNetwork.js';
import { PedestrianManager } from '../ai/PedestrianManager.js';
import { TrafficManager } from '../ai/TrafficManager.js';
import { PlayerStats } from './PlayerStats.js';
import { WantedSystem } from './WantedSystem.js';
import { WeaponSystem } from '../combat/WeaponSystem.js';
import { PoliceManager } from '../police/PoliceManager.js';
import { MissionManager } from '../missions/MissionManager.js';
import { CombatControls } from '../controls/CombatControls.js';
import { HUD } from '../ui/HUD.js';
import { Screens } from '../ui/Screens.js';
import { Minimap } from '../ui/Minimap.js';
import { Menu } from '../ui/Menu.js';
import { ParticleSystem } from '../vfx/ParticleSystem.js';
import { SkidMarks } from '../vfx/SkidMarks.js';
import { SaveManager } from './SaveManager.js';
import { PerformanceScaler } from './PerformanceScaler.js';
import { createConfig } from './Config.js';
import {
  resolveCarCollisions,
  resolveCarsVsPedestrians,
  pushCircleOutOfCars,
} from './PhysicsInteractions.js';

const Mode = { CHARACTER: 'character', VEHICLE: 'vehicle', AIRCRAFT: 'aircraft' };

export class Game {
  constructor(canvas, config, models = null) {
    this.config = config;
    this.models = models;

    // --- Subsystems ---------------------------------------------------------
    this.engine = new Engine(canvas, config);

    const aspect = window.innerWidth / window.innerHeight;
    this.thirdPerson = new ThirdPersonCamera(config, aspect);

    this.world = new World(this.engine.scene, config);
    this.player = new Player(this.engine.scene, config, models);
    this.vehicles = new VehicleManager(this.engine.scene, config, models);
    // A flyable helicopter parked on a nearby pad.
    this.helicopter = new Helicopter(this.engine.scene, config, { position: { x: -34, z: -30 } });
    this.audio = new AudioManager();

    // --- Part 5: polish + optimization systems ------------------------------
    this.dayNight = new DayNightCycle(this.engine);
    this.particles = new ParticleSystem(this.engine.scene);
    this.skids = new SkidMarks(this.engine.scene);
    this.minimap = new Minimap(132, 90, config.world.chunkSize);
    this.save = new SaveManager();
    this.perf = new PerformanceScaler(this.engine.renderer, config.pixelRatio, 55);

    // Track footstep cadence + car damage for audio/VFX triggers.
    this._stepPhase = 0;
    this._carDamage = 0;
    this._crashCooldown = 0;
    this._saveTimer = 0;
    this._blips = [];
    this._waypoints = [];

    // --- Part 3: ambient life (pedestrians + autonomous traffic) ------------
    this.roads = new RoadNetwork(config.world.chunkSize);
    this.pedestrians = new PedestrianManager(
      this.engine.scene,
      config,
      this.roads,
      this.world,
      models
    );
    this.traffic = new TrafficManager(this.engine.scene, config, this.roads, models);

    // --- Part 4: combat, police, missions, stats ----------------------------
    this.stats = new PlayerStats();
    this.wanted = new WantedSystem();
    this.weapons = new WeaponSystem(this.engine.scene, this.stats);
    this.police = new PoliceManager(this.engine.scene, config, this.roads, this.world, models);
    this.missions = new MissionManager(this.engine.scene);
    this.gameHud = new HUD();
    this.screens = new Screens();

    // Load persisted progress (cash, mission, remembered quality).
    this.saved = this.save.load();
    this.stats.cash = this.saved.cash || 0;
    this.highScore = this.saved.highScore || 0;

    // Main + pause menus (graphics quality remembered from the save).
    this.menu = new Menu(this.saved.quality || config.tier);

    // Reused each frame for off-screen culling + obstacle gathering (no GC).
    this._frustum = new THREE.Frustum();
    this._projScreen = new THREE.Matrix4();
    this._obstacles = [];
    this._cars = []; // normalized car descriptors for physics interactions
    this._forward = new THREE.Vector3();

    // Input: on-foot touch controls + the driving HUD + the ENTER prompt +
    // the on-foot combat buttons.
    this.controls = new TouchControls(canvas, this.thirdPerson);
    this.driving = new DrivingControls();
    this.flight = new FlightControls();
    this.enterPrompt = new ActionPrompt();
    this.combat = new CombatControls();

    // Spawn some parked cars to drive.
    this.vehicles.spawnDemoFleet();

    // True while a Wasted/Busted screen is up (gameplay is frozen).
    this.paused = false;

    // --- Mode state ---------------------------------------------------------
    this.mode = Mode.CHARACTER;
    this.currentVehicle = null; // the car being driven, or null on foot
    this.nearbyVehicle = null; // car in range of the ENTER prompt

    // Wire the driving HUD buttons to game actions.
    this.enterPrompt.onPress = () => this._tryEnterVehicle();
    this.driving.onExit = () => this.exitVehicle();
    this.driving.onHorn = () => this._honk();
    this.flight.onExit = () => this.exitAircraft();

    // Wire combat buttons: tap/hold to fire, tap to switch weapon, tap to jump.
    this.combat.onAttackPress = () => this._fireWeapon();
    this.combat.onSwitchWeapon = () => this.weapons.switchNext();
    this.combat.onJump = () => {
      if (this.mode === Mode.CHARACTER && !this.paused) this.player.jump();
    };
    this.combat.show(); // start on foot

    // Wire the respawn button.
    this.screens.onRespawn = () => this.respawn();

    // Mission reward payout, then queue the next delivery (endless missions).
    this.missions.onComplete = (cash) => {
      this.stats.addCash(cash);
      this.audio.uiClick();
      this._persist();
      setTimeout(() => this._startNextMission(), 2500);
    };

    // Wire the menus.
    this.menu.onPlay = () => this._beginPlay();
    this.menu.onResume = () => {
      this.audio.uiClick();
      this.paused = false;
    };
    this.menu.onRestart = () => {
      this.audio.uiClick();
      this.restart();
    };
    this.menu.onPause = () => {
      this.audio.uiClick();
      this.paused = true;
    };
    this.menu.onQuality = (tier) => this.setQuality(tier);

    // Size the renderer + keep camera aspect correct on resize/rotate.
    this.engine.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.engine.onResize = (w, h) => this.thirdPerson.setAspect(w / h);

    this.thirdPerson.configureFor('character');

    this.clock = new THREE.Clock();

    // Debug HUD.
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fps = 0;
    this.hud = document.getElementById('hud');
    // Move the debug readout clear of the minimap + pause button (top-left).
    if (this.hud) {
      this.hud.style.top = '200px';
      this.hud.style.left = '12px';
    }

    this._running = false;
    this._loop = this._loop.bind(this);

    // Scratch vector for the player's exit placement.
    this._tmpVec = new THREE.Vector3();
  }

  /** The entity the camera + world streaming currently track. */
  get activeEntity() {
    if (this.mode === Mode.VEHICLE) return this.currentVehicle;
    if (this.mode === Mode.AIRCRAFT) return this.helicopter;
    return this.player;
  }

  start() {
    // Prime chunk loading around spawn so the first visible frame isn't empty.
    this.world.update(this.player.position, 0);

    // Remember spawn as the safe respawn point (hospital/police release).
    this.stats.respawn.x = this.player.position.x;
    this.stats.respawn.z = this.player.position.z;

    // Start the first delivery mission (the marked car is the sleek sports car).
    this._startNextMission();

    // Boot into the main menu: the loop runs (rendering a live backdrop) but
    // the simulation stays paused until the player taps PLAY.
    this.paused = true;
    this._running = true;
    this.clock.start();
    requestAnimationFrame(this._loop);

    requestAnimationFrame(() => {
      const loading = document.getElementById('loading');
      if (loading) loading.classList.add('hidden');
    });
  }

  /** Called by the menu's PLAY button — unlock audio and drop into gameplay. */
  _beginPlay() {
    this.audio.unlock();
    this.audio.uiClick();
    this.paused = false;
    this.clock.getDelta(); // discard the long paused-time delta
  }

  /** Persist cash / high score / mission progress / quality to localStorage. */
  _persist() {
    this.highScore = Math.max(this.highScore, this.stats.cash);
    this.save.save({
      cash: this.stats.cash,
      highScore: this.highScore,
      missionStage: this.missions.stage,
      weapons: ['fists', 'pistol', 'rifle'],
      quality: this.menu.quality,
    });
  }

  // ---- Enter / exit vehicle -------------------------------------------------

  _tryEnterVehicle() {
    if (this.mode !== Mode.CHARACTER) return;
    const pos = this.player.position;
    const dist = (o) => (o ? Math.hypot(o.position.x - pos.x, o.position.z - pos.z) : Infinity);

    // Consider a parked car, a passing traffic car (carjack!), and the heli.
    const parked = this.vehicles.findNearest(pos);
    const traffic = this.traffic.findNearest(pos, 4.5);
    const heliD = this.helicopter.distanceTo(pos);

    const parkedD = dist(parked);
    const trafficD = dist(traffic);
    const min = Math.min(parkedD, trafficD, heliD);

    if (min === Infinity) return;
    if (min === heliD && heliD < 4) this.enterHelicopter();
    else if (min === trafficD) this._carjack(traffic);
    else if (parked) this.enterVehicle(parked);
  }

  /** Drag a driver out of a passing car and take it over. */
  _carjack(trafficCar) {
    // Spawn a matching drivable car where the traffic car is, then remove it.
    const car = this.vehicles.spawn({
      position: { x: trafficCar.position.x, z: trafficCar.position.z },
      heading: trafficCar.heading,
      color: trafficCar.color,
      type: trafficCar.typeName,
    });
    trafficCar.deactivate();
    this.enterVehicle(car);
  }

  /** Board the helicopter and switch to flight controls. */
  enterHelicopter() {
    this.helicopter.setOccupied(true);
    this.mode = Mode.AIRCRAFT;

    this.controls.setEnabled(false);
    this.enterPrompt.hide();
    this.combat.hide();
    this.flight.show();

    this.player.hide();
    this.thirdPerson.configureFor('aircraft');
    this.thirdPerson.yaw = this.helicopter.heading + Math.PI;
    this.audio.setEngine(true, 0.5); // rotor drone
  }

  /** Leave the helicopter (drops the player beside/below it on the ground). */
  exitAircraft() {
    if (this.mode !== Mode.AIRCRAFT) return;
    const exit = this.helicopter.getExitPosition();
    this.player.placeAt(exit, this.helicopter.heading);
    this.player.show();

    this.helicopter.setOccupied(false);
    this.mode = Mode.CHARACTER;

    this.flight.hide();
    this.controls.setEnabled(true);
    this.combat.show();
    this.thirdPerson.configureFor('character');
    this.audio.setEngine(false);
  }

  /** Pick a car to steal + a drop-off, and start (or restart) the mission. */
  _startNextMission() {
    // Prefer a not-currently-driven parked car; the sports car reads best.
    const cars = this.vehicles.vehicles.filter((v) => v !== this.currentVehicle);
    if (cars.length === 0) return;
    // Bias toward the first (sports) car for the very first mission.
    const target = cars[Math.floor(Math.random() * cars.length)];
    // Drop-off a good distance away in a random direction.
    const ang = Math.random() * Math.PI * 2;
    const r = 90 + Math.random() * 80;
    this.missions.start(target, {
      x: target.position.x + Math.cos(ang) * r,
      z: target.position.z + Math.sin(ang) * r,
    });
  }

  /** Sound the horn and scatter nearby pedestrians. */
  _honk() {
    this.audio.horn();
    const p = this.activeEntity.position;
    this.pedestrians.alert(p.x, p.z, 16);
  }

  /** Switch from on-foot to driving the given car. */
  enterVehicle(vehicle) {
    this.currentVehicle = vehicle;
    vehicle.setOccupied(true);
    this.mode = Mode.VEHICLE;

    // Swap controls: hide on-foot input + combat + prompt, show the driving HUD.
    this.controls.setEnabled(false);
    this.enterPrompt.hide();
    this.combat.hide();
    this.driving.show();

    // Hide the character; the camera now frames and trails the car.
    this.player.hide();
    this.thirdPerson.configureFor('vehicle');
    // Snap the camera behind the car immediately so entering isn't jarring.
    this.thirdPerson.yaw = vehicle.heading + Math.PI;

    this.nearbyVehicle = null;
    this._carDamage = 0;
    this.audio.setEngine(true, 0);

    // Taking a car is a (minor) crime, and may advance the mission.
    this.wanted.registerCrime('stealCar');
    this.missions.onEnterVehicle(vehicle);
  }

  /** Leave the current car and drop the player beside it. */
  exitVehicle() {
    if (this.mode !== Mode.VEHICLE || !this.currentVehicle) return;
    const car = this.currentVehicle;

    // Place the player at the driver door, facing away from the car.
    const exitPos = car.getExitPosition();
    this.player.placeAt(exitPos, car.heading);
    this.player.show();

    car.setOccupied(false);
    this.currentVehicle = null;
    this.mode = Mode.CHARACTER;

    // Swap controls back to on-foot.
    this.driving.hide();
    this.controls.setEnabled(true);
    this.combat.show();
    this.thirdPerson.configureFor('character');
    this.audio.setEngine(false);
  }

  // ---- Main loop ------------------------------------------------------------

  _loop() {
    if (!this._running) return;
    const delta = Math.min(this.clock.getDelta(), 0.1);

    // While a Wasted/Busted screen is up, freeze the simulation but keep
    // rendering the frozen frame behind the overlay.
    if (this.paused) {
      this.engine.render(this.thirdPerson.camera);
      requestAnimationFrame(this._loop);
      return;
    }

    if (this.mode === Mode.CHARACTER) {
      this._updateCharacterMode(delta);
    } else if (this.mode === Mode.VEHICLE) {
      this._updateVehicleMode(delta);
    } else {
      this._updateAircraftMode(delta);
    }

    // An empty helicopter idles its rotors and gently settles to the ground.
    if (this.mode !== Mode.AIRCRAFT) {
      this.helicopter.update({ collective: -0.4, forward: 0, yaw: 0 }, delta);
    }

    // Parked (player-spawned) cars settle to a stop.
    this.vehicles.update(delta);

    // Camera + shadow + world streaming all follow the active entity.
    const active = this.activeEntity.position;
    this.thirdPerson.update(active, delta);
    this.engine.updateSunTarget(active);
    this.world.update(active, delta);

    // Part 3: ambient life (pedestrians + traffic) + Part 4 police.
    this._updateAmbientLife(active, delta);
    this._updateWantedAndPolice(active, delta);

    // Part 4: resolve all moving-body collisions (car↔car, car↔ped, foot↔car).
    this._resolvePhysics(active);

    // Weapons cooldown/effects + mission progress + death check.
    this.weapons.update(delta);
    this._updateMission(active, delta);
    this._checkWasted();

    // Part 5: day/night, VFX, audio warble, dynamic resolution.
    this._crashCooldown = Math.max(0, this._crashCooldown - delta);
    this.dayNight.update(delta);
    this.particles.update(delta);
    this.skids.update(delta);
    this.audio.update(delta);
    this._updateMinimap(active);

    this.engine.render(this.thirdPerson.camera);

    // Dynamic resolution runs AFTER render so it measures real frame cost.
    this.perf.update(delta);

    this._updateHud(delta);
    this._updateGameHud(active);
    this._autoSave(delta);
    requestAnimationFrame(this._loop);
  }

  /** Feed the radar: player pose, police blips, mission waypoint. */
  _updateMinimap(active) {
    let yaw = this.player.facingYaw;
    if (this.mode === Mode.VEHICLE) yaw = this.currentVehicle.heading;
    else if (this.mode === Mode.AIRCRAFT) yaw = this.helicopter.heading;

    const blips = this._blips;
    blips.length = 0;
    for (const o of this.police.officers) {
      if (o.active && !o.isDead) blips.push({ x: o.position.x, z: o.position.z, color: '#ff3b3b' });
    }
    this.police.forEachActiveCar((c) =>
      blips.push({ x: c.position.x, z: c.position.z, color: '#4d7bff' })
    );

    const wp = this._waypoints;
    wp.length = 0;
    if (this.missions.beacon.visible) {
      wp.push({ x: this.missions.target.x, z: this.missions.target.z, color: '#ffd23f' });
    }

    this.minimap.update({ x: active.x, z: active.z, yaw }, blips, wp);
  }

  /** Save progress every ~10s of play (and clamp the high score). */
  _autoSave(delta) {
    this._saveTimer += delta;
    if (this._saveTimer >= 10) {
      this._saveTimer = 0;
      this._persist();
    }
  }

  _updateCharacterMode(delta) {
    // Move the player from the joystick, relative to the camera.
    this.player.update(this.controls.moveInput, this.thirdPerson.camera, delta);
    // Keep the player out of buildings.
    this.world.resolveCircle(this.player.position, 0.6);

    // Auto weapons keep firing while the button is held (semi/melee fire on tap).
    if (this.combat.attackHeld && this.weapons.current.auto) {
      this._fireWeapon();
    }

    // Footstep audio paced by the player's actual speed.
    if (this.player.currentSpeed > 0.3) {
      this._stepPhase += this.player.currentSpeed * delta;
      if (this._stepPhase > 1.4) {
        this._stepPhase = 0;
        this.audio.footstep();
      }
    }

    // Show/hide the ENTER prompt based on proximity to a car, a passing traffic
    // car (carjack), or the helicopter.
    const pos = this.player.position;
    const car = this.vehicles.findNearest(pos);
    const traffic = this.traffic.findNearest(pos, 4.5);
    const heliDist = this.helicopter.distanceTo(pos);
    this.nearbyVehicle = car;
    if (heliDist < 4) this.enterPrompt.show('ENTER HELI');
    else if (car || traffic) this.enterPrompt.show('ENTER');
    else this.enterPrompt.hide();
  }

  _updateAircraftMode(delta) {
    const input = this.flight.update();
    this.helicopter.update(input, delta);
    // Keep the chase camera trailing behind the helicopter's heading.
    this.thirdPerson.followBehind(this.helicopter.heading, delta);
    // Rotor drone rises a little with forward speed.
    this.audio.setEngine(true, 0.4 + Math.min(this.helicopter.speedMS / 30, 0.5));
  }

  // ---- Part 4: combat -------------------------------------------------------

  /** All NPCs the player's weapon can hit: civilians + cops. */
  _getWeaponTargets() {
    const targets = [];
    for (const p of this.pedestrians.pool) if (p.active && !p.isDead) targets.push(p);
    for (const o of this.police.activeOfficers) targets.push(o);
    return targets;
  }

  /** Fire the current weapon from the player, aiming where they face. */
  _fireWeapon() {
    if (this.mode !== Mode.CHARACTER || this.paused) return;

    // Aim along the player's facing direction (flattened).
    const yaw = this.player.facingYaw;
    this._forward.set(Math.sin(yaw), 0, Math.cos(yaw));

    const fired = this.weapons.fire(
      this.player.position,
      this._forward,
      this._getWeaponTargets(),
      (target, killed) => this._onWeaponHit(target, killed)
    );

    // Firing a gun: gunshot audio + crime heat.
    if (fired && !this.weapons.current.melee) {
      this.audio.gunshot();
      this.wanted.registerCrime('shoot');
    }
  }

  /** Score a weapon hit: injuring/killing civilians or cops raises the wanted. */
  _onWeaponHit(target, killed) {
    // Impact sparks at the victim.
    this.particles.sparks({ x: target.position.x, y: 1.1, z: target.position.z }, 6);

    const isCop = !!target.updateChase; // PoliceOfficer has this method
    if (isCop) {
      if (killed) this.wanted.registerCrime('killCop');
    } else if (killed) {
      this.wanted.registerCrime('killPed');
    } else {
      this.wanted.registerCrime('injurePed');
    }
  }

  _updateVehicleMode(delta) {
    // Resolve the driving HUD into an input object and drive the car.
    const input = this.driving.update();
    const car = this.currentVehicle;
    car.update(input, delta);

    // Keep the car out of buildings; on a hit, scrub the velocity into the wall.
    const normal = this.world.resolveCircle(car.position, car.collisionRadius);
    if (normal) car.onCollide(normal);

    // Engine note tracks speed (0..1 of top speed).
    this.audio.setEngine(true, Math.min(car.speedMS / car.maxSpeed, 1));

    // Tyre skid marks while drifting or braking hard at speed.
    if ((car.drifting || (input.brake > 0.3 && car.speedMS > 6)) && car.speedMS > 4) {
      this._dropSkids(car);
    }

    // A badly damaged engine smokes.
    if (this._carDamage > 55) {
      this.particles.smoke(car.position);
    }

    // Keep the camera trailing behind the car's heading.
    this.thirdPerson.followBehind(car.heading, delta);
  }

  /** Lay skid quads under the car's rear wheels (throttled by the pool). */
  _dropSkids(car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    // Two rear wheels, ~1.3 m back and ±0.95 m to the sides.
    for (const side of [-0.95, 0.95]) {
      this.skids.drop(
        car.position.x - fx * 1.3 + rx * side,
        car.position.z - fz * 1.3 + rz * side,
        car.heading
      );
    }
  }

  /**
   * Drive the pedestrian crowd + autonomous traffic for this frame, including
   * off-screen culling (via the camera frustum) and cross-avoidance (traffic
   * steers clear of the player and pedestrians).
   */
  _updateAmbientLife(activePos, delta) {
    // Refresh the camera frustum for culling. The camera moved this frame, so
    // rebuild its inverse-world matrix before deriving the frustum planes.
    const cam = this.thirdPerson.camera;
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    this._projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreen);

    // The player's car counts as a "threat" to pedestrians when speeding.
    let threatCar = null;
    if (this.mode === Mode.VEHICLE) {
      threatCar = {
        position: this.currentVehicle.position,
        speed: Math.abs(this.currentVehicle.speedKmh) / 3.6, // km/h → m/s
      };
    }

    // Update the crowd first so their fresh positions feed traffic avoidance.
    this.pedestrians.update(delta, activePos, this._frustum, threatCar);

    // Build the obstacle list traffic must not drive into: the player/car…
    const obstacles = this._obstacles;
    obstacles.length = 0;
    obstacles.push({ x: activePos.x, z: activePos.z });
    // …plus every active pedestrian.
    for (const p of this.pedestrians.pool) {
      if (p.active) obstacles.push({ x: p.position.x, z: p.position.z });
    }

    this.traffic.update(delta, activePos, this._frustum, obstacles);
  }

  // ---- Part 4: police, physics, mission, death ------------------------------

  /** Police are disabled by request — keep them recalled and silent. */
  _updateWantedAndPolice(activePos, delta) {
    // Let the wanted meter cool off, but never spawn police (stars forced 0).
    this.wanted.update(delta, false);
    this.police.update(delta, activePos, 0, () => {}, () => {}, () => {});
    if (this.police.engaged) this.police.clear();
    this.audio.setSiren(false);
  }

  /** Build the normalized car list (player car + traffic + police). */
  _gatherCars() {
    const cars = this._cars;
    cars.length = 0;

    if (this.mode === Mode.VEHICLE) {
      const v = this.currentVehicle;
      cars.push({
        ref: v,
        pos: v.position,
        r: v.collisionRadius,
        speed: v.speedMS,
        isPlayer: true,
        onImpact: (nx, nz, other) => {
          v.onCollide({ x: nx, z: nz });
          this._registerCrash(v, other);
        },
      });
    }
    this.traffic.forEachActive((c) =>
      cars.push({
        ref: c,
        pos: c.position,
        r: c.radius,
        speed: c.speedMS,
        isPlayer: false,
        onImpact: (nx, nz, other) => c.stun(1 + other * 0.06),
      })
    );
    this.police.forEachActiveCar((c) =>
      cars.push({
        ref: c,
        pos: c.position,
        r: c.radius,
        speed: c.speedMS,
        isPlayer: false,
        onImpact: (nx, nz, other) => c.stun(0.8 + other * 0.05),
      })
    );
    return cars;
  }

  /** A crash: play the sound (throttled), spark, and rack up car damage. */
  _registerCrash(car, otherSpeed) {
    const severity = car.speedMS + otherSpeed;
    if (severity < 3) return; // gentle nudge, ignore
    this._carDamage += severity * 1.5;
    this.particles.sparks({ x: car.position.x, y: 0.8, z: car.position.z }, 5);

    if (this._crashCooldown <= 0) {
      this._crashCooldown = 0.4;
      this.audio.crash();
    }

    // Total wreck → explode, hurt the player, and reset the damage counter.
    if (this._carDamage > 100) {
      this._carDamage = 0;
      this.particles.explosion(car.position);
      this.audio.crash();
      this.stats.takeDamage(45);
    }
  }

  /** Resolve car↔car crashes, car↔pedestrian hits, and on-foot↔car blocking. */
  _resolvePhysics(activePos) {
    const cars = this._gatherCars();

    // Car crashes (accidents): separate + stun/scrub speed.
    resolveCarCollisions(cars);

    // Cars running over civilians + cops.
    const peds = [];
    for (const p of this.pedestrians.pool) if (p.active) peds.push(p);
    for (const o of this.police.officers) if (o.active) peds.push(o);
    resolveCarsVsPedestrians(cars, peds, (result) => {
      this.wanted.registerCrime(result === 'killed' ? 'killPed' : 'injurePed');
    });

    // On foot, don't let the player walk through cars.
    if (this.mode === Mode.CHARACTER) {
      pushCircleOutOfCars(this.player.position, 0.6, cars);
    }
  }

  _updateMission(activePos, delta) {
    const inCar =
      this.mode === Mode.VEHICLE &&
      this.currentVehicle === this.missions.designatedCar;
    this.missions.update(delta, activePos, inCar);
  }

  /** If the player's health hit zero, show WASTED. */
  _checkWasted() {
    if (!this.stats.alive && !this.paused) {
      this.paused = true;
      this._silenceLoops();
      this.screens.show('wasted');
    }
  }

  _onBusted() {
    if (this.paused) return;
    this.paused = true;
    this._silenceLoops();
    this.stats.addCash(-Math.round(this.stats.cash * 0.25)); // lose 25% cash
    this.screens.show('busted');
  }

  /** Stop looping audio (engine/siren) when gameplay freezes. */
  _silenceLoops() {
    this.audio.setEngine(false);
    this.audio.setSiren(false);
  }

  /** Put the player back on foot from any vehicle/aircraft (shared reset). */
  _forceOnFoot() {
    if (this.mode === Mode.CHARACTER) return;
    if (this.currentVehicle) this.currentVehicle.setOccupied(false);
    this.currentVehicle = null;
    if (this.helicopter) this.helicopter.setOccupied(false);
    this.mode = Mode.CHARACTER;
    this.driving.hide();
    this.flight.hide();
    this.controls.setEnabled(true);
    this.combat.show();
    this.thirdPerson.configureFor('character');
  }

  /** Respawn the player at the safe point and reset the heat/police. */
  respawn() {
    this.stats.reset();
    this.wanted.clear();
    this.police.clear();

    // If they died in a vehicle/aircraft, get them back on foot first.
    this._forceOnFoot();

    this.player.placeAt(
      this._tmpVec.set(this.stats.respawn.x, 0, this.stats.respawn.z)
    );
    this.player.show();
    this._carDamage = 0;
    this._persist();
    this.paused = false;
  }

  /** Change graphics quality live (from the menu toggle). */
  setQuality(tier) {
    const c = createConfig(tier);
    this.perf.setMaxRatio(c.pixelRatio);
    this.world.chunkManager.viewDistance = c.viewDistance;
    this.world.chunkManager.unloadDistance = c.viewDistance + c.world.unloadBuffer;
    this.engine.renderer.shadowMap.enabled = c.shadows;
    this.engine.sun.castShadow = c.shadows;
    this.config.tier = tier;
    this._persist();
  }

  /** Restart the run: reset the player, heat, police and mission (keep cash). */
  restart() {
    this.wanted.clear();
    this.police.clear();
    this.stats.reset();
    this._silenceLoops();
    this._carDamage = 0;
    this._forceOnFoot();

    this.player.placeAt(this._tmpVec.set(this.stats.respawn.x, 0, this.stats.respawn.z));
    this.player.show();

    // Restart the starter mission from the top.
    const targetCar = this.vehicles.vehicles[2] || this.vehicles.vehicles[0];
    if (targetCar) this.missions.start(targetCar, { x: 120, z: 40 });

    this.paused = false;
  }

  /** Push the latest gameplay numbers into the top HUD. */
  _updateGameHud(activePos) {
    this.gameHud.update({
      health: this.stats.health,
      maxHealth: this.stats.maxHealth,
      armor: this.stats.armor,
      maxArmor: this.stats.maxArmor,
      cash: this.stats.cash,
      stars: this.wanted.stars,
      weaponName: this.weapons.current.name,
      ammo: this.weapons.ammo,
      objective: this.missions.objectiveText,
      distance: this.missions.distanceTo(activePos),
    });
  }

  _updateHud(delta) {
    if (!this.hud) return;
    this._fpsAccum += delta;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.25) {
      this._fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    const p = this.activeEntity.position;
    let modeLine;
    if (this.mode === Mode.VEHICLE) {
      const kmh = Math.abs(Math.round(this.currentVehicle.speedKmh));
      const drift = this.currentVehicle.drifting ? '  DRIFT!' : '';
      modeLine = `Mode: DRIVING  |  ${kmh} km/h${drift}`;
    } else if (this.mode === Mode.AIRCRAFT) {
      modeLine = `Mode: FLYING  |  ALT ${Math.round(this.helicopter.position.y)} m`;
    } else {
      modeLine = `Mode: ON FOOT  |  ${this.player.state.toUpperCase()}`;
    }

    this.hud.textContent =
      `FPS: ${this._fps}  |  Quality: ${this.config.tier}\n` +
      `${modeLine}\n` +
      `Chunks: ${this.world.loadedChunkCount}  |  ` +
      `NPCs: ${this.pedestrians.activeCount}  |  Cars: ${this.traffic.activeCount}\n` +
      `Pos: ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`;
    this.hud.style.whiteSpace = 'pre';
  }

  stop() {
    this._running = false;
  }

  dispose() {
    this.stop();
    this._silenceLoops();
    this.controls.dispose();
    this.driving.dispose();
    this.flight.dispose();
    this.enterPrompt.dispose();
    this.combat.dispose();
    this.screens.dispose();
    this.minimap.dispose();
    this.menu.dispose();
    this.particles.dispose();
    this.skids.dispose();
    this.pedestrians.dispose();
    this.traffic.dispose();
    this.police.dispose();
    this.vehicles.dispose();
    this.world.dispose();
    this.engine.dispose();
  }
}
