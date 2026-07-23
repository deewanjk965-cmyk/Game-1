/**
 * Config.js
 * ---------
 * Single source of truth for every tunable number in the game.
 *
 * Mobile devices vary wildly in power, so instead of hard-coding quality we
 * expose a small set of "quality tiers". `detectQualityTier()` picks a sane
 * default from the device, and everything else (render scale, view distance,
 * shadow use) is derived from that tier. Part 2+ can override any value.
 */

// Quality tiers, from weakest phone to desktop-class hardware.
export const QualityTier = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

/**
 * Per-tier settings. These are the knobs that most affect mobile performance:
 * - pixelRatio      : how many device pixels we actually render (biggest win).
 * - viewDistance    : chunk radius loaded around the player (memory + draw).
 * - shadows         : real-time shadows are expensive on mobile GPUs.
 * - maxLightsShadow : cap on shadow-casting lights.
 * - fog             : fog lets us hide the chunk pop-in at the far edge.
 */
export const TierSettings = {
  [QualityTier.LOW]: {
    pixelRatio: 1,
    viewDistance: 2, // 5x5 chunk grid
    shadows: false,
    antialias: false,
    fogNear: 40,
    fogFar: 120,
  },
  [QualityTier.MEDIUM]: {
    pixelRatio: 1.5,
    viewDistance: 3, // 7x7 chunk grid
    shadows: true,
    antialias: false,
    fogNear: 70,
    fogFar: 200,
  },
  [QualityTier.HIGH]: {
    pixelRatio: 2,
    viewDistance: 4, // 9x9 chunk grid
    shadows: true,
    antialias: true,
    fogNear: 120,
    fogFar: 320,
  },
};

// World-space constants shared by the whole game.
export const WorldConfig = {
  // Size (in world units / metres) of one square chunk of terrain.
  chunkSize: 64,
  // How many chunks we keep *loaded* beyond the visible view distance before
  // unloading them. A small hysteresis buffer prevents load/unload thrashing
  // when the player walks back and forth across a chunk border.
  unloadBuffer: 1,
  // Ground/gravity plane height (Part 2 physics will build on this).
  groundLevel: 0,
};

/**
 * Cheap heuristic to guess a starting quality tier from the device.
 * We keep it conservative — it's always better to start smooth and let the
 * player opt into higher quality than to stutter on first load.
 */
export function detectQualityTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4; // GB, Chrome-only, defaults safe.
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  if (isMobile) {
    // Low-end phones: few cores or little RAM.
    if (cores <= 4 || memory <= 3) return QualityTier.LOW;
    return QualityTier.MEDIUM;
  }

  // Desktop / high-end tablet.
  return cores >= 8 ? QualityTier.HIGH : QualityTier.MEDIUM;
}

/**
 * Build the final, flat config object the rest of the game consumes.
 * @param {string} [tier] Force a specific tier; otherwise auto-detect.
 */
export function createConfig(tier = detectQualityTier()) {
  const settings = TierSettings[tier] ?? TierSettings[QualityTier.MEDIUM];
  return {
    tier,
    ...settings,
    world: WorldConfig,
    // Clamp the device pixel ratio so 3x-density phones don't melt.
    pixelRatio: Math.min(settings.pixelRatio, window.devicePixelRatio || 1),
  };
}
