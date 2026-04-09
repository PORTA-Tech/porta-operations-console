# PORTA Operations Console

Admin console for the current PORTA V1 operations surface.

## Current Scope

- `System Health`
- `User Activity`
- `Trust Level`
- `Actions`

## Behavior Glossary

The console should use the canonical product meanings below even while control-plane and Windows transport still expose some legacy compatibility fields:

- `focus episode`
  - Durable user-facing focus time.
- `pressure`
  - Expressive user-facing overload score.
- `overload active`
  - Conservative stabilized overload state for intervention logic.
- `short break`
  - Product-facing name for the lighter break intervention.
- `long break`
  - Product-facing name for the stronger break intervention.
- `limited`
  - Truth is usable but certainty is reduced.
- `updating`
  - Last known usable value is shown while fresh analyzed state catches up.

## Legacy Migration Map

- `taskContinuitySeconds` -> focus-episode duration compatibility field
- `taskContinuityScore` -> focus-episode quality compatibility field
- `overloadLikelihood` -> pressure compatibility field
- `stretch_break_suggestion` -> short break
- `break_suggestion` -> long break
- `breakPendingAction` -> break readiness compatibility field
- `breakPendingKind` -> canonical short-break / long-break readiness field

The console may still consume those transport fields, but it should not present them to operators as the final product terminology.

## Run

```bash
npm install
npm run dev
```

## Checks

```bash
npm run check
npm run build
```

## Environment

- `VITE_API_BASE_URL`
- `VITE_WS_BASE_URL`
