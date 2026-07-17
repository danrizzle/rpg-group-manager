# RPG Group Manager

Management RPG with fully simulated combat — see [DESIGN.md](DESIGN.md).

## Development

Everything runs inside Docker; the host needs nothing but Docker itself.

```sh
./web                                     # browser prototype → http://localhost:5174
./dev pnpm install                        # once
./dev pnpm test                           # test suites
./dev pnpm typecheck                      # strict TS check
./dev pnpm --filter @rpg/engine cli -- --n 5000        # Monte Carlo vs. test boss
./dev pnpm --filter @rpg/engine cli -- --n 1000 \
    --offense 0.6 --targeting 0.5 --potion 35 --discipline 50 --trace
```

## Packages

- `packages/engine` — phase 1: the combat sim engine. Pure TypeScript module,
  zero runtime dependencies, deterministic given (setup, seed). Discrete-event
  simulation; every fight is an event stream; Monte Carlo analysis with
  distribution output. Runs in Node and the browser unchanged.
- `apps/web` — phase 2: browser prototype (Vite + React + Zustand). Behavior
  sliders, training-dummy Monte Carlo in a Web Worker with distribution review,
  and a real-time fight view (bars + combat log) that replays the engine's
  event stream.
