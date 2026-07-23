/**
 * Engine.js
 * ---------
 * Owns the low-level three.js objects: renderer, scene, lights and the
 * resize handling. It knows nothing about gameplay — that separation keeps
 * the rendering layer reusable and easy to reason about.
 */

import * as THREE from 'three';

export class Engine {
  /**
   * @param {HTMLCanvasElement} canvas The single game canvas.
   * @param {object} config Flat config from createConfig().
   */
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;

    // --- Renderer -----------------------------------------------------------
    // `powerPreference: high-performance` asks mobile GPUs for the fast path.
    // We keep alpha off (opaque canvas) and stencil off to save bandwidth.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: config.antialias,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(config.pixelRatio);
    this.renderer.shadowMap.enabled = config.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Modern colour pipeline so materials look correct on all devices.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // --- Scene --------------------------------------------------------------
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b7e0); // daytime sky blue

    // Distance fog hides the far edge where chunks stream in/out, so pop-in
    // is invisible. Colour matches the sky so the horizon blends seamlessly.
    this.scene.fog = new THREE.Fog(0x87b7e0, config.fogNear, config.fogFar);

    this._setupLights();

    // Track viewport size and keep the renderer/camera in sync.
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  }

  /**
   * A cheap two-light rig: one ambient fill + one directional "sun".
   * Only the sun casts shadows, and only when the quality tier allows it.
   */
  _setupLights() {
    // Soft sky/ground ambient so nothing is pure black.
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x5a4633, 0.6);
    this.scene.add(hemi);

    // The sun. Positioned high and to one side for pleasant angled shadows.
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(60, 120, 40);
    sun.castShadow = this.config.shadows;

    if (this.config.shadows) {
      // Keep the shadow map small on mobile — 1024 is a good balance.
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 400;
      const s = 80;
      sun.shadow.camera.left = -s;
      sun.shadow.camera.right = s;
      sun.shadow.camera.top = s;
      sun.shadow.camera.bottom = -s;
      sun.shadow.bias = -0.0004;
    }

    this.scene.add(sun);
    this.sun = sun;
    this.hemiLight = hemi;
  }

  /**
   * The shadow-casting sun uses an orthographic frustum that only covers a
   * patch of the world. We slide that patch to follow the player so shadows
   * always render around them without needing a world-sized shadow map.
   * @param {THREE.Vector3} target Usually the player position.
   */
  updateSunTarget(target) {
    if (!this.config.shadows) return;
    this.sun.position.set(target.x + 60, target.y + 120, target.z + 40);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    if (!this.sun.target.parent) this.scene.add(this.sun.target);
  }

  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    // Notify whoever owns the camera (Game) via a callback if set.
    if (this.onResize) this.onResize(width, height);
  }

  /** Render one frame with the given camera. */
  render(camera) {
    this.renderer.render(this.scene, camera);
  }

  /** Release GPU resources and listeners. */
  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.renderer.dispose();
  }
}
