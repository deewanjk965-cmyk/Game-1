/**
 * PlayerStats.js
 * --------------
 * The player's RPG-ish numbers: health, armor, cash, and per-weapon ammo,
 * plus the safe respawn point. Kept as plain state with small helpers so every
 * system (combat, police, missions, HUD) reads/writes one source of truth.
 */

export class PlayerStats {
  constructor() {
    this.maxHealth = 100;
    this.health = 100;
    this.maxArmor = 100;
    this.armor = 0;
    this.cash = 0;

    // Ammo per weapon id (unarmed has none). Refilled on respawn.
    this.ammo = { pistol: 60, rifle: 120 };

    // Where the player respawns after Wasted/Busted.
    this.respawn = { x: 0, z: 0 };

    this.alive = true;
  }

  /** Apply incoming damage: armor soaks most of it, then health. */
  takeDamage(amount) {
    if (!this.alive) return;
    if (this.armor > 0) {
      const soaked = Math.min(this.armor, amount * 0.7);
      this.armor -= soaked;
      amount -= soaked;
    }
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.alive = false;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addCash(amount) {
    this.cash = Math.max(0, this.cash + amount);
  }

  /** Full reset used when respawning after Wasted/Busted. */
  reset() {
    this.health = this.maxHealth;
    this.armor = 0;
    this.ammo = { pistol: 60, rifle: 120 };
    this.alive = true;
  }
}
