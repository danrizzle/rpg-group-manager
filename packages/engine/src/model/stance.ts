/**
 * Behavior sliders — the only combat controls the player has (GDD §3).
 * No rotation or priority lists; sliders reweight the decision scoring.
 */
export interface StanceConfig {
  /** 0 = fully defensive … 1 = fully offensive. */
  offense: number;
  /** 0 = single-target … 1 = AoE. */
  targeting: number;
  /** Use a potion when HP falls below this percent (0..100). */
  potionThresholdPct: number;
  /** Unlockable slider — v1 supports 'automatic' only; the enum is the extension point. */
  burstCds: 'automatic' | 'save-for-plan-window';
}

export const DEFAULT_STANCE: StanceConfig = {
  offense: 0.6,
  targeting: 0.5,
  potionThresholdPct: 35,
  burstCds: 'automatic',
};

export function validateStance(s: StanceConfig): void {
  const in01 = (n: number) => n >= 0 && n <= 1;
  if (!in01(s.offense)) throw new Error(`offense out of range: ${s.offense}`);
  if (!in01(s.targeting)) throw new Error(`targeting out of range: ${s.targeting}`);
  if (s.potionThresholdPct < 0 || s.potionThresholdPct > 100) {
    throw new Error(`potionThresholdPct out of range: ${s.potionThresholdPct}`);
  }
}
