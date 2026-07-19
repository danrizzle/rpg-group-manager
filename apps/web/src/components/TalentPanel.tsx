import {
  LEVEL_CAP,
  MAGE_TALENTS,
  PRIEST_TALENTS,
  WARRIOR_TALENTS,
  talentPointsForLevel,
  type TalentNode,
  type TalentTree,
} from '@rpg/engine';
import { useStore } from '../store';
import type { WorldCharId } from '../world/types';
import { MATERIAL_LABELS, RESPEC_COST } from '../world/professions';

/**
 * The v1 talent tree (GDD §2): nodes by tier, spend/refund against the
 * cap-granted point pool. Generic over the acting character's class tree —
 * Elara (mage) uses the top-level talent state, recruits use their roster
 * build's talents.
 */

const TIERS = [1, 2, 3] as const;
const TREE: Record<WorldCharId, TalentTree> = {
  mage: MAGE_TALENTS,
  warrior: WARRIOR_TALENTS,
  priest: PRIEST_TALENTS,
};

export function TalentPanel({ charId, level }: { charId: WorldCharId; level: number }) {
  const tree = TREE[charId];
  const isMage = charId === 'mage';

  const talents = useStore((s) => (isMage ? s.talents : s.roster[charId as 'warrior' | 'priest'].talents));
  const respecStock = useStore((s) => s.materials[RESPEC_COST.material]);
  const spendMage = useStore((s) => s.spendTalent);
  const refundMage = useStore((s) => s.refundTalent);
  const respecMage = useStore((s) => s.respecTalents);
  const spendRoster = useStore((s) => s.spendRosterTalent);
  const refundRoster = useStore((s) => s.refundRosterTalent);
  const respecRoster = useStore((s) => s.respecRosterTalents);

  const roster = charId as 'warrior' | 'priest';
  const spend = isMage ? spendMage : (id: string) => spendRoster(roster, id);
  const refund = isMage ? refundMage : (id: string) => refundRoster(roster, id);
  const respec = isMage ? respecMage : () => respecRoster(roster);

  const nodeName = (id: string) => tree.nodes.find((n) => n.id === id)?.name ?? id;
  const pool = talentPointsForLevel(level);
  const spent = talents.reduce((sum, id) => sum + (tree.nodes.find((n) => n.id === id)?.cost ?? 0), 0);
  const remaining = pool - spent;
  const respecLabel = `${RESPEC_COST.count} ${MATERIAL_LABELS[RESPEC_COST.material]}`;
  const canAffordRespec = (respecStock ?? 0) >= RESPEC_COST.count;

  const lockedReason = (node: TalentNode): string | null => {
    if (talents.includes(node.id)) return null;
    const missing = (node.requires ?? []).filter((req) => !talents.includes(req));
    if (missing.length) return `requires ${missing.map(nodeName).join(', ')}`;
    if (node.cost > remaining) return 'not enough points';
    return null;
  };

  const refundBlocked = (node: TalentNode): boolean =>
    tree.nodes.some((n) => talents.includes(n.id) && (n.requires ?? []).includes(node.id));

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
              disabled={talents.length === 0 || !canAffordRespec}
              onClick={respec}
              title={
                canAffordRespec
                  ? `Refund all talent points for ${respecLabel} (GDD §2 "small resource cost")`
                  : `Refund all talent points — needs ${respecLabel} (you have ${respecStock ?? 0})`
              }
            >
              Respec ({respecLabel})
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
              {tree.nodes
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
                      onClick={() => (taken ? refund(node.id) : spend(node.id))}
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
