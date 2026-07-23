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

  /** A fresh copy of the car model. */
  cloneFerrari() {
    if (!this.ferrari) return null;
    return this.ferrari.clone(true);
  }
}
