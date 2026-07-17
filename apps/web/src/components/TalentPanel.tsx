import { LEVEL_CAP, MAGE_TALENTS, talentPointsForLevel, type TalentNode } from '@rpg/engine';
import { talentPointsRemaining, useStore } from '../store';

/**
 * The v1 talent tree (GDD §2): nodes by tier, spend/refund against the
 * cap-granted point pool. Data-driven off MAGE_TALENTS like the gear picker.
 */

const TIERS = [1, 2, 3] as const;

function nodeName(id: string): string {
  return MAGE_TALENTS.nodes.find((n) => n.id === id)?.name ?? id;
}

export function TalentPanel({ level }: { level: number }) {
  const talents = useStore((s) => s.talents);
  const spendTalent = useStore((s) => s.spendTalent);
  const refundTalent = useStore((s) => s.refundTalent);
  const respecTalents = useStore((s) => s.respecTalents);

  const pool = talentPointsForLevel(level);
  const remaining = talentPointsRemaining(talents, level);

  const lockedReason = (node: TalentNode): string | null => {
    if (talents.includes(node.id)) return null;
    const missing = (node.requires ?? []).filter((req) => !talents.includes(req));
    if (missing.length) return `requires ${missing.map(nodeName).join(', ')}`;
    if (node.cost > remaining) return 'not enough points';
    return null;
  };

  const refundBlocked = (node: TalentNode): boolean =>
    MAGE_TALENTS.nodes.some((n) => talents.includes(n.id) && (n.requires ?? []).includes(node.id));

  return (
    <>
      <div className="preset-row">
        <h3>Talents</h3>
        {level >= LEVEL_CAP && (
          <>
            <span className="chip">
              {remaining} / {pool} points
            </span>
            <button
              className="btn btn-small"
              disabled={talents.length === 0}
              onClick={respecTalents}
              title="Refund all talent points (free in v1; a resource cost comes with the economy)"
            >
              Respec
            </button>
          </>
        )}
      </div>
      {level < LEVEL_CAP ? (
        <p className="muted">Talents unlock at level {LEVEL_CAP}.</p>
      ) : (
        TIERS.map((tier) => (
          <div className="control" key={tier}>
            <div className="control-label">Tier {tier}</div>
            <div className="segmented">
              {MAGE_TALENTS.nodes
                .filter((n) => n.tier === tier)
                .map((node) => {
                  const taken = talents.includes(node.id);
                  const locked = !taken && lockedReason(node) !== null;
                  const blocked = taken && refundBlocked(node);
                  const title = taken
                    ? blocked
                      ? `${node.desc} — refund its dependents first`
                      : `${node.desc} — click to refund`
                    : locked
                      ? `${node.desc} — ${lockedReason(node)}`
                      : `${node.desc} — costs ${node.cost} point${node.cost > 1 ? 's' : ''}`;
                  return (
                    <button
                      key={node.id}
                      className={`btn btn-small ${taken ? 'btn-active' : ''}`}
                      disabled={locked || blocked}
                      title={title}
                      onClick={() => (taken ? refundTalent(node.id) : spendTalent(node.id))}
                    >
                      {node.name} ({node.cost})
                    </button>
                  );
                })}
            </div>
          </div>
        ))
      )}
    </>
  );
}
