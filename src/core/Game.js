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
import { Audio } from './Audio.js';
import { World } from '../world/World.js';
import { Player } from '../entities/Player.js';
import { VehicleManager } from '../entities/VehicleManager.js';
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
import {
  resolveCarCollisions,
  resolveCarsVsPedestrians,
  pushCircleOutOfCars,
} from './PhysicsInteractions.js';

const Mode = { CHARACTER: 'character', VEHICLE: 'vehicle' };

export class Game {
  constructor(canvas, config) {
    this.config = config;

    // --- Subsystems ---------------------------------------------------------
    this.engine = new Engine(canvas, config);

    const aspect = window.innerWidth / window.innerHeight;
    this.thirdPerson = new ThirdPersonCamera(config, aspect);

    this.world = new World(this.engine.scene, config);
    this.player = new Player(this.engine.scene, config);
    this.vehicles = new VehicleManager(this.engine.scene, config);
    this.audio = new Audio();

    // --- Part 3: ambient life (pedestrians + autonomous traffic) ------------
    this.roads = new RoadNetwork(config.world.chunkSize);
    this.pedestrians = new PedestrianManager(
      this.engine.scene,
      config,
      this.roads,
      this.world
    );
    this.traffic = new TrafficManager(this.engine.scene, config, this.roads);

    // --- Part 4: combat, police, missions, stats ----------------------------
    this.stats = new PlayerStats();
    this.wanted = new WantedSystem();
    this.weapons = new WeaponSystem(this.engine.scene, this.stats);
    this.police = new PoliceManager(this.engine.scene, config, this.roads, this.world);
    this.missions = new MissionManager(this.engine.scene);
    this.gameHud = new HUD();
    this.screens = new Screens();

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

    // Wire combat buttons: tap/hold to fire, tap to switch weapon.
    this.combat.onAttackPress = () => this._fireWeapon();
    this.combat.onSwitchWeapon = () => this.weapons.switchNext();
    this.combat.show(); // start on foot

    // Wire the respawn button.
    this.screens.onRespawn = () => this.respawn();

    // Mission reward payout.
    this.missions.onComplete = (cash) => this.stats.addCash(cash);

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

    this._running = false;
    this._loop = this._loop.bind(this);

    // Scratch vector for the player's exit placement.
    this._tmpVec = new THREE.Vector3();
  }

  /** The entity the camera + world streaming currently track. */
  get activeEntity() {
    return this.mode === Mode.VEHICLE ? this.currentVehicle : this.player;
  }

  start() {
    // Prime chunk loading around spawn so the first visible frame isn't empty.
    this.world.update(this.player.position, 0);

    // Remember spawn as the safe respawn point (hospital/police release).
    this.stats.respawn.x = this.player.position.x;
    this.stats.respawn.z = this.player.position.z;

    // Kick off the starter mission: steal a marked car, deliver it for cash.
    const targetCar = this.vehicles.vehicles[2] || this.vehicles.vehicles[0];
    if (targetCar) this.missions.start(targetCar, { x: 120, z: 40 });

    this._running = true;
    this.clock.start();
    requestAnimationFrame(this._loop);

    requestAnimationFrame(() => {
      const loading = document.getElementById('loading');
      if (loading) loading.classList.add('hidden');
    });
  }

  // ---- Enter / exit vehicle -------------------------------------------------

  _tryEnterVehicle() {
    if (this.mode !== Mode.CHARACTER) return;
    const car = this.vehicles.findNearest(this.player.position);
    if (car) this.enterVehicle(car);
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
    } else {
      this._updateVehicleMode(delta);
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

    this.engine.render(this.thirdPerson.camera);

    this._updateHud(delta);
    this._updateGameHud(active);
    requestAnimationFrame(this._loop);
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

    // Show/hide the ENTER prompt based on proximity to a car.
    const car = this.vehicles.findNearest(this.player.position);
    this.nearbyVehicle = car;
    if (car) this.enterPrompt.show('ENTER');
    else this.enterPrompt.hide();
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

    // Firing a gun in public is itself a crime (raises heat).
    if (fired && !this.weapons.current.melee) this.wanted.registerCrime('shoot');
  }

  /** Score a weapon hit: injuring/killing civilians or cops raises the wanted. */
  _onWeaponHit(target, killed) {
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

    // Keep the camera trailing behind the car's heading.
    this.thirdPerson.followBehind(car.heading, delta);
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

  /** Cool the wanted meter and run the police response. */
  _updateWantedAndPolice(activePos, delta) {
    this.wanted.update(delta, this.police.engaged);

    this.police.update(
      delta,
      activePos,
      this.wanted.stars,
      (dmg) => this.stats.takeDamage(dmg), // cops shoot the player
      () => this._onBusted(), // arrested
      (cop) => this.wanted.registerCrime('killCop') // player killed a cop
    );

    // When the meter clears, recall any lingering police.
    if (this.wanted.stars === 0 && this.police.engaged) this.police.clear();
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
        onImpact: (nx, nz) => v.onCollide({ x: nx, z: nz }),
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
      this.screens.show('wasted');
    }
  }

  _onBusted() {
    if (this.paused) return;
    this.paused = true;
    this.stats.addCash(-Math.round(this.stats.cash * 0.25)); // lose 25% cash
    this.screens.show('busted');
  }

  /** Respawn the player at the safe point and reset the heat/police. */
  respawn() {
    this.stats.reset();
    this.wanted.clear();
    this.police.clear();

    // If they died in a car, get them back on foot first.
    if (this.mode === Mode.VEHICLE) {
      if (this.currentVehicle) this.currentVehicle.setOccupied(false);
      this.currentVehicle = null;
      this.mode = Mode.CHARACTER;
      this.driving.hide();
      this.controls.setEnabled(true);
      this.combat.show();
      this.thirdPerson.configureFor('character');
    }

    this.player.placeAt(
      this._tmpVec.set(this.stats.respawn.x, 0, this.stats.respawn.z)
    );
    this.player.show();
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
    this.controls.dispose();
    this.driving.dispose();
    this.enterPrompt.dispose();
    this.combat.dispose();
    this.screens.dispose();
    this.pedestrians.dispose();
    this.traffic.dispose();
    this.police.dispose();
    this.vehicles.dispose();
    this.world.dispose();
    this.engine.dispose();
  }
}
