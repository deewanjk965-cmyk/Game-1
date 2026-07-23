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
const HEAD_GEO = new THREE.SphereGeometry(0.17, 12, 10);
const TORSO_GEO = new THREE.BoxGeometry(0.42, 0.6, 0.24);
const HIP_GEO = new THREE.BoxGeometry(0.42, 0.18, 0.24);
const LIMB_GEO = new THREE.BoxGeometry(0.15, 0.52, 0.17); // arm/leg (shorter → foot/hand fits)
const EYE_GEO = new THREE.SphereGeometry(0.028, 6, 6);
const PUPIL_GEO = new THREE.SphereGeometry(0.014, 6, 6);
const HAIR_GEO = new THREE.SphereGeometry(0.185, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
const FOOT_GEO = new THREE.BoxGeometry(0.16, 0.12, 0.3);
const HAND_GEO = new THREE.BoxGeometry(0.14, 0.14, 0.15);

const SKINS = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0x3d6cb5, 0xb5523d, 0x4c9a5a, 0xb59a3d, 0x8a4cb5, 0x2b2f36, 0xcfd3d8];
const PANTS = [0x2a2f38, 0x3a4250, 0x5a4432, 0x22262c, 0x444a55];
const HAIRS = [0x2a1a10, 0x4a3520, 0x0e0e12, 0x6b4a2a, 0x8a8a8a];

const EYE_WHITE = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
const PUPIL_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5 });

// A limb pivoted at the top, with an optional end cap (foot or hand).
function limb(color, x, y, shadows, endGeo, endMat, endY) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const mesh = new THREE.Mesh(LIMB_GEO, color);
  mesh.position.y = -0.26;
  mesh.castShadow = shadows;
  pivot.add(mesh);
  if (endGeo) {
    const end = new THREE.Mesh(endGeo, endMat);
    end.position.y = endY;
    end.castShadow = shadows;
    pivot.add(end);
  }
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

  const hair = opts.hair ?? HAIRS[(Math.random() * HAIRS.length) | 0];
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });

  const group = new THREE.Group();

  // --- Head with a real face (eyes + pupils + hair) -----------------------
  const head = new THREE.Group();
  head.position.y = 1.6;
  const skull = new THREE.Mesh(HEAD_GEO, skinMat);
  skull.scale.set(0.95, 1.1, 1); // slightly oval, more human than a ball
  skull.castShadow = shadows;
  head.add(skull);

  const hairCap = new THREE.Mesh(HAIR_GEO, hairMat);
  hairCap.position.y = 0.02;
  head.add(hairCap);

  for (const ex of [-0.06, 0.06]) {
    const eye = new THREE.Mesh(EYE_GEO, EYE_WHITE);
    eye.position.set(ex, 0.02, 0.15);
    head.add(eye);
    const pupil = new THREE.Mesh(PUPIL_GEO, PUPIL_MAT);
    pupil.position.set(ex, 0.02, 0.172);
    head.add(pupil);
  }
  // Small nose.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 6), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.02, 0.17);
  head.add(nose);
  group.add(head);

  const torso = new THREE.Mesh(TORSO_GEO, shirtMat);
  torso.position.y = 1.18;
  torso.castShadow = shadows;
  group.add(torso);

  const hips = new THREE.Mesh(HIP_GEO, pantsMat);
  hips.position.y = 0.88;
  group.add(hips);

  // Legs (with shoes) + arms (with hands).
  const legL = limb(pantsMat, -0.12, 0.82, shadows, FOOT_GEO, pantsMat, -0.52);
  const legR = limb(pantsMat, 0.12, 0.82, shadows, FOOT_GEO, pantsMat, -0.52);
  const armL = limb(shirtMat, -0.29, 1.46, shadows, HAND_GEO, skinMat, -0.5);
  const armR = limb(shirtMat, 0.29, 1.46, shadows, HAND_GEO, skinMat, -0.5);
  group.add(legL, legR, armL, armR);

  return { group, limbs: { legL, legR, armL, armR }, materials: { skinMat, shirtMat, pantsMat, hairMat } };
}
