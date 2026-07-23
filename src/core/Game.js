/**
 * Game.js
 * -------
 * The orchestrator. It wires together the engine, world streaming, player,
 * camera and input, and runs the main loop. This is the one place that knows
 * about all the subsystems — everything else stays decoupled.
 *
 * Main loop order each frame:
 *   1. read input        (touch controls already updated via events)
 *   2. update player      (move from joystick, relative to camera)
 *   3. update camera      (follow the player)
 *   4. update world       (stream chunks around the player)
 *   5. render
 */

import * as THREE from 'three';
import { Engine } from './Engine.js';
import { World } from '../world/World.js';
import { Player } from '../entities/Player.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { TouchControls } from '../controls/TouchControls.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} config Flat config from createConfig().
   */
  constructor(canvas, config) {
    this.config = config;

    // --- Subsystems ---------------------------------------------------------
    this.engine = new Engine(canvas, config);

    const aspect = window.innerWidth / window.innerHeight;
    this.thirdPerson = new ThirdPersonCamera(config, aspect);

    this.world = new World(this.engine.scene, config);
    this.player = new Player(this.engine.scene, config);
    this.controls = new TouchControls(canvas, this.thirdPerson);

    // Size the renderer to the current viewport now that everything exists.
    this.engine.renderer.setSize(window.innerWidth, window.innerHeight, false);

    // Keep the camera projection correct when the device rotates/resizes.
    this.engine.onResize = (w, h) => this.thirdPerson.setAspect(w / h);

    // Fixed-timestep-ish clock for frame-rate-independent movement.
    this.clock = new THREE.Clock();

    // Lightweight FPS accumulator for the debug HUD.
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fps = 0;
    this.hud = document.getElementById('hud');

    this._running = false;
    this._loop = this._loop.bind(this);
  }

  /** Prime one frame so the world exists before we hide the splash. */
  start() {
    // Force an initial chunk load around the spawn point so the player never
    // sees an empty void on the first visible frame.
    this.world.update(this.player.position, 0);

    this._running = true;
    this.clock.start();
    requestAnimationFrame(this._loop);

    // Hide the loading splash on the next frame.
    requestAnimationFrame(() => {
      const loading = document.getElementById('loading');
      if (loading) loading.classList.add('hidden');
    });
  }

  _loop() {
    if (!this._running) return;

    // Clamp delta so a background tab (huge dt) can't teleport the player.
    const delta = Math.min(this.clock.getDelta(), 0.1);

    // 1-2) Player moves from the joystick, relative to where the camera looks.
    this.player.update(this.controls.moveInput, this.thirdPerson.camera, delta);

    // 3) Camera follows the player.
    this.thirdPerson.update(this.player.position, delta);

    // Slide the shadow frustum to stay centred on the player.
    this.engine.updateSunTarget(this.player.position);

    // 4) Stream world chunks around the player's new position.
    this.world.update(this.player.position, delta);

    // 5) Render.
    this.engine.render(this.thirdPerson.camera);

    this._updateHud(delta);
    requestAnimationFrame(this._loop);
  }

  _updateHud(delta) {
    if (!this.hud) return;
    this._fpsAccum += delta;
    this._fpsFrames++;
    // Refresh the readout ~4x per second.
    if (this._fpsAccum >= 0.25) {
      this._fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
    const p = this.player.position;
    this.hud.textContent =
      `FPS: ${this._fps}  |  Quality: ${this.config.tier}\n` +
      `Chunks loaded: ${this.world.loadedChunkCount}\n` +
      `Pos: ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`;
    // Preserve the newlines above.
    this.hud.style.whiteSpace = 'pre';
  }

  stop() {
    this._running = false;
  }

  dispose() {
    this.stop();
    this.controls.dispose();
    this.world.dispose();
    this.engine.dispose();
  }
}
