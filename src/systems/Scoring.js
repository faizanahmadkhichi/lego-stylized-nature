export const SCORING_DEFAULTS = Object.freeze({
  drone: 100,
  balloon: 50,
  /** Seconds between kills to keep the combo alive. */
  comboWindow: 5,
  maxCombo: 5,
})

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function normalizeScoringConfig(config = {}) {
  return {
    drone: Math.max(0, Math.floor(finiteOr(config.drone, SCORING_DEFAULTS.drone))),
    balloon: Math.max(0, Math.floor(finiteOr(config.balloon, SCORING_DEFAULTS.balloon))),
    comboWindow: Math.max(0, finiteOr(config.comboWindow, SCORING_DEFAULTS.comboWindow)),
    maxCombo: Math.max(1, Math.floor(finiteOr(config.maxCombo, SCORING_DEFAULTS.maxCombo))),
  }
}

const BEST_KEY = 'brickland.best.score'

/**
 * Score + kill-streak combo. Destroying targets in quick succession raises
 * the combo multiplier (up to maxCombo); the combo resets when no target is
 * destroyed inside the combo window. The best score persists in
 * localStorage. No group, no rendering — the HUD reads `score` directly.
 */
export default class Scoring {
  constructor(experience, options = {}) {
    this.experience = experience
    this.config = normalizeScoringConfig(
      options.config ?? experience.config?.scoring,
    )
    this.score = 0
    this.combo = 0
    this.best = 0
    this._lastKillTime = -Infinity
    try {
      const stored = Number(this.experience?.storage?.getItem?.(BEST_KEY)
        ?? globalThis.localStorage?.getItem(BEST_KEY))
      if (Number.isFinite(stored) && stored > 0) {
        this.best = Math.floor(stored)
      }
    }
    catch { /* Storage may be unavailable in private or embedded browsing. */ }
  }

  /** Records a kill. Returns the points earned and the current combo. */
  addKill(type) {
    const now = this.experience.time.getElapsed()
    if (now - this._lastKillTime < this.config.comboWindow) {
      this.combo = Math.min(this.combo + 1, this.config.maxCombo)
    }
    else {
      this.combo = 1
    }
    this._lastKillTime = now
    const base = type === 'drone' ? this.config.drone : this.config.balloon
    const points = base * this.combo
    this.score += points
    if (this.score > this.best) {
      this.best = this.score
      try {
        globalThis.localStorage?.setItem(BEST_KEY, String(this.best))
      }
      catch { /* Storage may be unavailable. */ }
    }
    return { points, combo: this.combo }
  }

  update() {
    if (this.combo === 0) {
      return
    }
    const now = this.experience.time.getElapsed()
    if (now - this._lastKillTime >= this.config.comboWindow) {
      this.combo = 0
    }
  }

  reset() {
    this.score = 0
    this.combo = 0
    this._lastKillTime = -Infinity
  }
}
