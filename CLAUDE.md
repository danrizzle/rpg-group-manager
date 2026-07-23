# RPG Group Manager

Management RPG with fully simulated combat — you build, optimize and lead
characters; you never play them. Idle RPG meets Football Manager with WoW
raiding DNA.

**Start here:** read `STATUS.md` (where we are, what's next), then the
relevant sections of `DESIGN.md` (the GDD — source of truth for all design).

## Dev environment — everything runs in Docker

Never install tooling on the host. Use the wrappers:

```sh
./dev <cmd>            # run any command in the container, e.g. ./dev pnpm test
./web                  # dev server → http://localhost:5174 (5173 is taken by another project)
./dev pnpm --filter @rpg/engine cli -- --n 2000 --gear starter --trace   # Monte Carlo harness
```

CLI tuning flags: `--gear naked|starter|default|best`, `--hp`, `--enrage <s>`,
`--offense`, `--targeting`, `--potion`, `--discipline`, `--talents
<build|id,…>`, `--barrier reactive|proactive`, `--consumables <id,…|none>`
(absent = legacy free-potion character), `--seed`, `--json`, `--trace`.

## Architecture rules (violating these is a bug)

- `packages/engine` is a **pure, zero-dependency, deterministic** module:
  a fight is a pure function of (setup, seed). No `Math.random`, no `Date`,
  no platform APIs. It must run in Node and the browser unchanged.
- **The event stream is the source of truth.** All metrics/UI/replays are
  computed from `CombatEvent[]` only, never from sim internals.
- **Content is data, sim is code.** Abilities, bosses, items are declarative;
  new content must not require engine changes.
- Time is integer milliseconds; discrete-event scheduler (no fixed ticks).

## Design principles (from hard-won user feedback)

- **Low micromanagement, always.** No rotation lists, no per-character piano.
- **Intent/execution split:** players set intent via few discrete *named*
  states (stances); earned stats (discipline, AoE efficiency, …) determine
  execution quality. No continuous sliders — they can't be plan building blocks.
- **Two currencies (GDD §2):** gear (time) and knowledge (plans/skill) both
  buy kill probability; active play grants *earliness*, never power.
  No content scaling, ever. Normal is tuned against defaults; hard content
  against plans.
- Tuning caveat: near an enrage wall, time-to-kill stats are survivorship-
  biased — measure true distributions with `--enrage 900` before moving numbers.

## Workflow

- Update `STATUS.md` when a roadmap slice lands or balance targets move.
- Commit per slice/experiment; balance numbers live in
  `packages/engine/src/content/` (classes, bosses, items).
- Always end a slice by writing a handoff prompt for the next slice that needs
  doing: refresh `HANDOFF.md` (or an equivalent next-slice brief) so a fresh
  session can pick up cold — name the next slice, what's already true, and the
  traps.
