/**
 * Models.js
 * ---------
 * Loads the real 3D assets (an animated human + a car) and hands out clones.
 * Everything is preloaded once before the game starts, so gameplay never
 * stalls on a network fetch. If loading fails, the game falls back to the
 * built-in low-poly meshes, so it always runs.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Outfit tints applied per character so the crowd isn't all identical.
const CHAR_TINTS = [
  0xffffff, 0x9fb0c8, 0xc8a98a, 0xa8c0a0, 0xd0a0a0, 0xb0a8c8, 0xd8c890, 0x88a0b8,
].map((c) => new THREE.Color(c));

export class Models {
  constructor() {
    const base = import.meta.env.BASE_URL || '/';
    this.loader = new GLTFLoader();
    // The car model is DRACO-compressed, so wire up the local decoder.
    const draco = new DRACOLoader();
    draco.setDecoderPath(`${base}draco/`);
    this.loader.setDRACOLoader(draco);

    this.base = base;
    this.soldier = null; // { scene, animations }
    this.ferrari = null; // gltf scene
    this.ready = false;
  }

  async loadAll() {
    // Load each asset independently so one failing doesn't kill the other.
    const soldier = await this._tryLoad(`${this.base}models/soldier.glb`);
    if (soldier) this.soldier = { scene: soldier.scene, animations: soldier.animations };

    const ferrari = await this._tryLoad(`${this.base}models/ferrari.glb`);
    if (ferrari) this.ferrari = ferrari.scene;

    this.ready = !!(this.soldier || this.ferrari);
  }

  async _tryLoad(url) {
    try {
      return await this._load(url);
    } catch (e) {
      console.warn('Model load failed, using built-in mesh for', url, e);
      return null;
    }
  }

  _load(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
  }

  /** A fresh, independently-animatable copy of the human (with its skeleton). */
  cloneSoldier() {
    if (!this.soldier) return null;
    const scene = skeletonClone(this.soldier.scene);
    return { scene, animations: this.soldier.animations };
  }

  /**
   * Build a ready-to-use animated character: scaled to ~1.8 m, grounded, with
   * an AnimationMixer and idle/walk/run actions. Returns null if the model
   * isn't available (caller then falls back to the built-in humanoid).
   */
  makeCharacter(config) {
    const c = this.cloneSoldier();
    if (!c) return null;
    const group = c.scene;

    // IMPORTANT: update world matrices before measuring — the glTF node scales
    // must be applied or the bounding box is degenerate (→ absurd scale).
    group.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(group);
    const h = box.max.y - box.min.y;
    const scale = h > 0.01 && isFinite(h) ? THREE.MathUtils.clamp(1.8 / h, 0.05, 20) : 1;
    group.scale.setScalar(scale);
    group.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(group);
    group.position.y -= box.min.y; // feet on the ground

    // The model's native forward is -Z; the game's forward is +Z, so face it
    // the right way (otherwise the character moon-walks forwards).
    group.rotation.y = Math.PI;

    // Per-instance variety: tint the outfit and vary the height a touch so the
    // crowd doesn't look like identical clones.
    const tint = CHAR_TINTS[(Math.random() * CHAR_TINTS.length) | 0];
    const heightVar = 0.92 + Math.random() * 0.16;
    group.scale.multiplyScalar(heightVar);
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = config.shadows;
        o.frustumCulled = false; // skinned bounds are unreliable
        if (o.material) {
          o.material = o.material.clone();
          o.material.color.multiply(tint);
        }
      }
    });

    const mixer = new THREE.AnimationMixer(group);
    const act = (n) => {
      const clip = THREE.AnimationClip.findByName(c.animations, n);
      return clip ? mixer.clipAction(clip) : null;
    };
    return { group, mixer, actions: { idle: act('Idle'), walk: act('Walk'), run: act('Run') } };
  }

  /** A fresh copy of the car model. */
  cloneFerrari() {
    if (!this.ferrari) return null;
    return this.ferrari.clone(true);
  }
}
