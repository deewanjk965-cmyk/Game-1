/**
 * humanMesh.js
 * ------------
 * A simple low-poly humanoid (head, torso, two arms, two legs) whose limbs are
 * parented at the hip/shoulder so they can swing for a real walk cycle. Shared
 * by pedestrians, the player and police officers.
 *
 * Returns the group plus the four limb pivots so the owner can animate them:
 *   limbs.legL / legR / armL / armR  — rotate each on X to swing.
 */

import * as THREE from 'three';

// Shared geometries.
const HEAD_GEO = new THREE.SphereGeometry(0.16, 10, 8);
const TORSO_GEO = new THREE.BoxGeometry(0.42, 0.6, 0.24);
const HIP_GEO = new THREE.BoxGeometry(0.42, 0.18, 0.24);
const LIMB_GEO = new THREE.BoxGeometry(0.15, 0.62, 0.17); // reused for arms+legs

const SKINS = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0x3d6cb5, 0xb5523d, 0x4c9a5a, 0xb59a3d, 0x8a4cb5, 0x2b2f36, 0xcfd3d8];
const PANTS = [0x2a2f38, 0x3a4250, 0x5a4432, 0x22262c, 0x444a55];

function limb(color, x, y, shadows) {
  // Pivot at the top (shoulder/hip); the limb hangs below it so rotating the
  // pivot swings the whole limb naturally.
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const mesh = new THREE.Mesh(LIMB_GEO, color);
  mesh.position.y = -0.31;
  mesh.castShadow = shadows;
  pivot.add(mesh);
  return pivot;
}

/**
 * @param {object} config Game config (shadow flags).
 * @param {object} [opts] { skin, shirt, pants } colour overrides.
 */
export function buildHuman(config, opts = {}) {
  const shadows = config.shadows;
  const skin = opts.skin ?? SKINS[(Math.random() * SKINS.length) | 0];
  const shirt = opts.shirt ?? SHIRTS[(Math.random() * SHIRTS.length) | 0];
  const pants = opts.pants ?? PANTS[(Math.random() * PANTS.length) | 0];

  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.85 });

  const group = new THREE.Group();

  const head = new THREE.Mesh(HEAD_GEO, skinMat);
  head.position.y = 1.62;
  head.castShadow = shadows;
  group.add(head);

  const torso = new THREE.Mesh(TORSO_GEO, shirtMat);
  torso.position.y = 1.18;
  torso.castShadow = shadows;
  group.add(torso);

  const hips = new THREE.Mesh(HIP_GEO, pantsMat);
  hips.position.y = 0.88;
  group.add(hips);

  const legL = limb(pantsMat, -0.12, 0.88, shadows);
  const legR = limb(pantsMat, 0.12, 0.88, shadows);
  const armL = limb(shirtMat, -0.29, 1.46, shadows);
  const armR = limb(shirtMat, 0.29, 1.46, shadows);
  group.add(legL, legR, armL, armR);

  return { group, limbs: { legL, legR, armL, armR }, materials: { skinMat, shirtMat, pantsMat } };
}
