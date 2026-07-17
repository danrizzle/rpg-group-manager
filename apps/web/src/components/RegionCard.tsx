import { ZONES, levelForXp } from '@rpg/engine';
import { useStore } from '../store';
import { BRIDGE_COST, rateKey, regionUnlocked, type RegionMeta } from '../world/tasks';

const RISK_CHIP: Record<string, string> = {
  low: 'chip',
  risky: 'chip chip-warn',
  deadly: 'chip chip-danger',
};

export function RegionCard({ region }: { region: RegionMeta }) {
  const xp = useStore((s) => s.xp);
  const gear = useStore((s) => s.gear);
  const stance = useStore((s) => s.stance);
  const behavior = useStore((s) => s.behavior);
  const here = useStore((s) => s.region);
  const unlocks = useStore((s) => s.unlocks);
  const materials = useStore((s) => s.materials);
  const rateCache = useStore((s) => s.rateCache);
  const enqueueTravel = useStore((s) => s.enqueueTravel);
  const enqueueGrind = useStore((s) => s.enqueueGrind);
  const enqueueGather = useStore((s) => s.enqueueGather);
  const buildBridge = useStore((s) => s.buildBridge);
  const pull = useStore((s) => s.pull);

  const level = levelForXp(xp);
  const unlocked = regionUnlocked(region.id, unlocks);
  const band = ZONES[region.id]!().mobs[0]!.levelBand;
  const rate = rateCache[rateKey(region.id, level, gear, stance, behavior)];
  const isHere = here === region.id;

  // Bridge (Ashen gate): buildable from anywhere once enough timber is banked.
  const timber = materials.bridgeTimber;
  const canBuildBridge = region.id === 'ashen-foothills' && !unlocks.bridgeBuilt && timber >= BRIDGE_COST.bridgeTimber;

  // A zone boss can be challenged once its home region is reachable:
  // Bandit Warlord lives in Heartfield (always); Emberwing in Ashen (needs the bridge).
  const canChallenge =
    !!region.boss &&
    !unlocked &&
    (region.boss.id === 'bandit-warlord' ? true : unlocks.bridgeBuilt);

  return (
    <div className={`panel region-card ${unlocked ? '' : 'region-locked'} ${isHere ? 'region-here' : ''}`}>
      <div className="region-head">
        <span className="region-name">{region.name}</span>
        <span className="chip">Lv {band.min}–{band.max}</span>
        {isHere && <span className="chip chip-warn">here</span>}
      </div>

      {unlocked ? (
        <div className="region-rates">
          {rate ? (
            <>
              <span className="region-xp">{Math.round(rate.xpPerHour).toLocaleString()} XP/hr</span>
              <span className={RISK_CHIP[rate.riskTier]}>{rate.riskTier}</span>
              <span className="muted">{rate.deathsPerHour.toFixed(1)} deaths/hr</span>
            </>
          ) : (
            <span className="muted">computing…</span>
          )}
        </div>
      ) : (
        <div className="region-gate muted">{region.gateHint}</div>
      )}

      <div className="region-actions">
        {unlocked && (
          <>
            <button className="btn btn-small" disabled={isHere} onClick={() => enqueueTravel(region.id)}>
              {isHere ? 'You are here' : 'Travel here'}
            </button>
            <button className="btn btn-small btn-primary" disabled={!rate} onClick={() => enqueueGrind(region.id)}>
              Send to grind
            </button>
            {region.gathers && (
              <button className="btn btn-small" onClick={() => enqueueGather(region.id)}>
                Gather timber
              </button>
            )}
            {region.capstoneBoss && (
              <button className="btn btn-small btn-primary" onClick={() => pull(region.capstoneBoss!.id)}>
                Challenge {region.capstoneBoss.name}
              </button>
            )}
          </>
        )}
        {canChallenge && region.boss && (
          <button className="btn btn-small btn-primary" onClick={() => pull(region.boss!.id)}>
            Challenge {region.boss.name}
          </button>
        )}
        {region.id === 'ashen-foothills' && !unlocks.bridgeBuilt && (
          <button className="btn btn-small btn-primary" disabled={!canBuildBridge} onClick={buildBridge}>
            Build Bridge ({timber}/{BRIDGE_COST.bridgeTimber} timber)
          </button>
        )}
      </div>
    </div>
  );
}
