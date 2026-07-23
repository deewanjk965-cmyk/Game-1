/**
 * Engine.js
 * ---------
 * Owns the low-level three.js objects: renderer, scene, lights and the
 * resize handling. It knows nothing about gameplay — that separation keeps
 * the rendering layer reusable and easy to reason about.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

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
    // Modern colour pipeline + filmic tone mapping so the lighting reads as
    // real (highlights roll off instead of blowing out to flat white).
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // --- Scene --------------------------------------------------------------
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b7e0); // daytime sky blue

    // Distance fog hides the far edge where chunks stream in/out, so pop-in
    // is invisible. Colour matches the sky so the horizon blends seamlessly.
    this.scene.fog = new THREE.Fog(0x87b7e0, config.fogNear, config.fogFar);

    // Image-based ambient light: a prefiltered studio environment gives every
    // PBR material soft reflections + realistic ambient, which is the single
    // biggest step up from flat Lambert shading.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.envIntensity = 0.55; // scene-wide reflection strength (tuned per-material)

    this._setupLights();

    // Bloom post-processing (emissive glow). Disabled by default: the half-float
    // render targets it needs are black on some GL stacks (e.g. software GL), and
    // a guaranteed-visible scene matters more than the glow halo. Emissive
    // windows/lights still show; they just don't bloom. Toggle via setBloom(true).
    this.usePost = false;
    this.composer = null;
    this.bloom = null;

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

    // Offset of the sun from the player; the day/night cycle rotates this so
    // the light (and shadows) sweep across the sky through the day.
    this.sunOffset = new THREE.Vector3(60, 120, 40);
  }

  /**
   * The shadow-casting sun uses an orthographic frustum that only covers a
   * patch of the world. We slide that patch to follow the player so shadows
   * always render around them without needing a world-sized shadow map.
   * @param {THREE.Vector3} target Usually the player position.
   */
  updateSunTarget(target) {
    // Always keep the sun aimed at the player (even without shadows) so the
    // day/night cycle's directional light lands where the action is.
    this.sun.position.set(
      target.x + this.sunOffset.x,
      target.y + this.sunOffset.y,
      target.z + this.sunOffset.z
    );
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    if (!this.sun.target.parent) this.scene.add(this.sun.target);
  }

  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    if (this.composer) this.composer.setSize(width, height);
    // Notify whoever owns the camera (Game) via a callback if set.
    if (this.onResize) this.onResize(width, height);
  }

  /** Build the post-processing chain once the camera exists. */
  _initComposer(camera) {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, camera));
    // Only bright pixels (emissive windows, lights, sun) bloom — keeps it
    // tasteful instead of washing the whole frame out.
    this.bloom = new UnrealBloomPass(size, 0.55, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this._postCamera = camera;
  }

  /** Render one frame with the given camera (through bloom if enabled). */
  render(camera) {
    if (this.usePost) {
      if (!this.composer || this._postCamera !== camera) this._initComposer(camera);
      this.composer.render();
    } else {
      this.renderer.render(this.scene, camera);
    }
  }

  /** Release GPU resources and listeners. */
  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.renderer.dispose();
  }
}
