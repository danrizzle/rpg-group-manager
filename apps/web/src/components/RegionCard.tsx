import { ZONES } from '@rpg/engine';
import { useCharBuild, useStore } from '../store';
import { MATERIAL_LABELS } from '../world/professions';
import { BRIDGE_COST, WARCAMP_COST, rateKey, regionUnlocked, type RegionMeta } from '../world/tasks';

const RISK_CHIP: Record<string, string> = {
  low: 'chip',
  risky: 'chip chip-warn',
  deadly: 'chip chip-danger',
};

export function RegionCard({ region }: { region: RegionMeta }) {
  // Everything build-shaped is read for the ACTING character — each hero
  // farms with their own kit, so the XP/hr and risk chips are theirs.
  const charId = useStore((s) => s.activeWorldChar);
  const build = useCharBuild(charId);
  const here = useStore((s) => s.chars[s.activeWorldChar]?.region ?? 'heartfield');
  const unlocks = useStore((s) => s.unlocks);
  const materials = useStore((s) => s.materials);
  const rateCache = useStore((s) => s.rateCache);
  const enqueueTravel = useStore((s) => s.enqueueTravel);
  const enqueueGrind = useStore((s) => s.enqueueGrind);
  const enqueueGather = useStore((s) => s.enqueueGather);
  const buildBridge = useStore((s) => s.buildBridge);
  const buildWarcamp = useStore((s) => s.buildWarcamp);
  const pull = useStore((s) => s.pull);

  const unlocked = regionUnlocked(region.id, unlocks);
  const band = ZONES[region.id]!().mobs[0]!.levelBand;
  const rate =
    rateCache[rateKey(charId, region.id, build.level, build.gear, build.stance, build.behavior, build.talents)];
  const isHere = here === region.id;

  // Bridge (Ashen gate): buildable from anywhere once enough timber is banked.
  const timber = materials.bridgeTimber;
  const canBuildBridge = region.id === 'ashen-foothills' && !unlocks.bridgeBuilt && timber >= BRIDGE_COST.bridgeTimber;

  // Warcamp (Cinder Wastes gate → the Cinderforge raid). Shown only once the
  // Ember Forge has paid out its seal, so it can't read as an unreachable
  // teaser before the dungeon is cleared.
  const showWarcamp =
    region.id === 'cinder-wastes' && !unlocks.raidAccess && materials.forgeSeal > 0;
  const warcampShort = Object.entries(WARCAMP_COST).filter(
    ([m, n]) => (materials[m as keyof typeof materials] ?? 0) < n,
  );

  // A gate boss can be challenged once its home region is reachable, and stays
  // repeatable after the first kill (re-fight for practice/loot):
  // Bandit Warlord lives in Heartfield (always); Emberwing in Ashen (needs the bridge).
  const canChallenge =
    !!region.boss &&
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
            <button className="btn btn-small" disabled={isHere} onClick={() => enqueueTravel(charId, region.id)}>
              {isHere ? 'You are here' : 'Travel here'}
            </button>
            <button className="btn btn-small btn-primary" disabled={!rate} onClick={() => enqueueGrind(charId, region.id)}>
              Send to grind
            </button>
            {region.gather && (
              <button className="btn btn-small" onClick={() => enqueueGather(charId, region.id)}>
                Gather {MATERIAL_LABELS[region.gather.material]}
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
        {showWarcamp && (
          <button
            className="btn btn-small btn-primary"
            disabled={warcampShort.length > 0}
            onClick={buildWarcamp}
            title={`Opens the Cinderforge raid — ${Object.entries(WARCAMP_COST)
              .map(([m, n]) => `${materials[m as keyof typeof materials] ?? 0}/${n} ${MATERIAL_LABELS[m as keyof typeof materials]}`)
              .join(', ')}`}
          >
            Raise Warcamp
            {warcampShort.length > 0 &&
              ` (need ${warcampShort
                .map(([m, n]) => `${n - (materials[m as keyof typeof materials] ?? 0)} ${MATERIAL_LABELS[m as keyof typeof materials]}`)
                .join(', ')})`}
          </button>
        )}
      </div>
    </div>
  );
}
