import { LEVEL_CAP, talentPointsForLevel, type TalentNode } from '@rpg/engine';
import { CLASSES, useStore } from '../store';
import type { CharId } from '../world/types';
import { MATERIAL_LABELS, RESPEC_COST } from '../world/professions';

/**
 * The talent tree (GDD §2): nodes by tier, spend/refund against the
 * cap-granted point pool. Generic over the character's class tree.
 */

const EMPTY: string[] = [];
const TIERS = [1, 2, 3] as const;

/**
 * Talent tree for any character. Slice 8 dropped the mage-vs-recruit branch:
 * the tree comes from the class registry and the actions are char-scoped.
 */
export function TalentPanel({ charId, level }: { charId: CharId; level: number }) {
  const classId = useStore((s) => s.characters[charId]?.classId ?? 'mage');
  const tree = CLASSES[classId].tree;

  const talents = useStore((s) => s.characters[charId]?.talents) ?? EMPTY;
  const respecStock = useStore((s) => s.materials[RESPEC_COST.material]);
  const spendTalent = useStore((s) => s.spendTalent);
  const refundTalent = useStore((s) => s.refundTalent);
  const respecTalents = useStore((s) => s.respecTalents);

  const spend = (id: string) => spendTalent(charId, id);
  const refund = (id: string) => refundTalent(charId, id);
  const respec = () => respecTalents(charId);

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
