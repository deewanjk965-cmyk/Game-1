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

    // Input: on-foot touch controls + the driving HUD + the ENTER prompt.
    this.controls = new TouchControls(canvas, this.thirdPerson);
    this.driving = new DrivingControls();
    this.enterPrompt = new ActionPrompt();

    // Spawn some parked cars to drive.
    this.vehicles.spawnDemoFleet();

    // --- Mode state ---------------------------------------------------------
    this.mode = Mode.CHARACTER;
    this.currentVehicle = null; // the car being driven, or null on foot
    this.nearbyVehicle = null; // car in range of the ENTER prompt

    // Wire the driving HUD buttons to game actions.
    this.enterPrompt.onPress = () => this._tryEnterVehicle();
    this.driving.onExit = () => this.exitVehicle();
    this.driving.onHorn = () => this.audio.horn();

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

  /** Switch from on-foot to driving the given car. */
  enterVehicle(vehicle) {
    this.currentVehicle = vehicle;
    vehicle.setOccupied(true);
    this.mode = Mode.VEHICLE;

    // Swap controls: hide on-foot input + prompt, show the driving HUD.
    this.controls.setEnabled(false);
    this.enterPrompt.hide();
    this.driving.show();

    // Hide the character; the camera now frames and trails the car.
    this.player.hide();
    this.thirdPerson.configureFor('vehicle');
    // Snap the camera behind the car immediately so entering isn't jarring.
    this.thirdPerson.yaw = vehicle.heading + Math.PI;

    this.nearbyVehicle = null;
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
    this.thirdPerson.configureFor('character');
  }

  // ---- Main loop ------------------------------------------------------------

  _loop() {
    if (!this._running) return;
    const delta = Math.min(this.clock.getDelta(), 0.1);

    if (this.mode === Mode.CHARACTER) {
      this._updateCharacterMode(delta);
    } else {
      this._updateVehicleMode(delta);
    }

    // Parked cars settle to a stop (AI traffic is Part 3).
    this.vehicles.update(delta);

    // Camera + shadow + world streaming all follow the active entity.
    const active = this.activeEntity.position;
    this.thirdPerson.update(active, delta);
    this.engine.updateSunTarget(active);
    this.world.update(active, delta);

    this.engine.render(this.thirdPerson.camera);

    this._updateHud(delta);
    requestAnimationFrame(this._loop);
  }

  _updateCharacterMode(delta) {
    // Move the player from the joystick, relative to the camera.
    this.player.update(this.controls.moveInput, this.thirdPerson.camera, delta);

    // Show/hide the ENTER prompt based on proximity to a car.
    const car = this.vehicles.findNearest(this.player.position);
    this.nearbyVehicle = car;
    if (car) this.enterPrompt.show('ENTER');
    else this.enterPrompt.hide();
  }

  _updateVehicleMode(delta) {
    // Resolve the driving HUD into an input object and drive the car.
    const input = this.driving.update();
    this.currentVehicle.update(input, delta);
    // Keep the camera trailing behind the car's heading.
    this.thirdPerson.followBehind(this.currentVehicle.heading, delta);
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
      `Chunks loaded: ${this.world.loadedChunkCount}\n` +
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
    this.vehicles.dispose();
    this.world.dispose();
    this.engine.dispose();
  }
}
