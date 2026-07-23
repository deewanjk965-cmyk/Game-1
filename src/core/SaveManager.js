/**
 * SaveManager.js
 * --------------
 * Tiny localStorage persistence for the bits worth keeping across refreshes:
 * cash, high score, unlocked weapons and mission progress. All reads/writes are
 * wrapped in try/catch so private-mode or disabled storage never crashes the
 * game (it just runs without saving).
 */

const KEY = 'openworld_save_v1';

const DEFAULTS = {
  cash: 0,
  highScore: 0,
  missionStage: 'goto_car',
  weapons: ['fists', 'pistol', 'rifle'], // all unlocked by default here
  quality: null, // remembered graphics tier, or null = auto
};

export class SaveManager {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      /* storage unavailable — run without persistence */
    }
  }

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
  }
}
