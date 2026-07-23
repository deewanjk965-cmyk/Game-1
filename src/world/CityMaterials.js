/**
 * CityMaterials.js
 * ----------------
 * Shared PBR materials for the city, created once and reused by every chunk
 * (so instancing works and memory stays flat). A `setNight()` hook lets the
 * day/night cycle switch window + street-lamp emissives on after dark, which is
 * what makes the skyline read as a living city at night.
 */

import * as THREE from 'three';
import { getTextures } from './Textures.js';

let _mats = null;

export function getCityMaterials() {
  if (_mats) return _mats;
  const tex = getTextures();

  // Buildings: concrete + glass facade, with an emissive window map for night.
  const building = new THREE.MeshStandardMaterial({
    map: tex.buildingColor,
    emissiveMap: tex.buildingEmissive,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.72,
    metalness: 0.12,
  });

  const roadH = new THREE.MeshStandardMaterial({ map: tex.asphaltH, roughness: 0.95, metalness: 0 });
  const roadV = new THREE.MeshStandardMaterial({ map: tex.asphaltV, roughness: 0.95, metalness: 0 });
  const ground = new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1, metalness: 0 });
  const sidewalk = new THREE.MeshStandardMaterial({ color: 0x9a9ea6, roughness: 0.9, metalness: 0 });

  const lampPost = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.8 });
  const lampHead = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    emissive: 0xffd27a,
    emissiveIntensity: 0,
  });

  const trunk = new THREE.MeshStandardMaterial({ color: 0x5a4231, roughness: 1 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 1 });

  _mats = { building, roadH, roadV, ground, sidewalk, lampPost, lampHead, trunk, foliage };
  return _mats;
}

/**
 * Drive the night-time glow. `night` is 0 (full day) → 1 (full night).
 */
export function setNight(night) {
  if (!_mats) return;
  _mats.building.emissiveIntensity = night * 1.15;
  _mats.lampHead.emissiveIntensity = night * 2.6;
}
