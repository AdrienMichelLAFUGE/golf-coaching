# TypeScript Memo (Radar + UI)

This memo catalogs the TS errors fixed during the last deploy cycle and the safe patterns to avoid repeating them.

## Catalog of recent TS errors (with fixes)

1) `Cannot find namespace 'JSX'` in TSX files
   - Cause: using `JSX.Element` in a file where the JSX namespace was not available.
   - Fix: use `ReactElement` and import it: `import type { ReactElement } from "react";`

2) Type guards returning optional props vs required props
   - Error: `Type '{ ...; shotIndex?: number }' is not assignable to '{ ...; shotIndex: number | undefined }'`.
   - Fix: make the predicate return the exact type, e.g.
     - `entry is { value: number; shotIndex: number | undefined }`
     - prefer `entry !== null` over `!!entry`

3) `string | false` not assignable to `boolean` in filter predicates
   - Example: `filter((item) => !!item && item.value)` when `item.value` is string
   - Fix: `item !== null && item.value !== ""` (explicit boolean)

4) `metrics.someField` possibly null
   - Example: `metrics.spinRate.key` or `metrics.faceImpactLateral.key`
   - Fix: local narrow before use:
     ```
     const spinRate = metrics.spinRate;
     if (!spinRate) return [];
     const x = shot[spinRate.key];
     ```

5) `Property 'i' does not exist on type 'never'` (best-of loops)
   - Cause: TS fails to infer object type in `best` reducer.
   - Fix: use scalar variables:
     ```
     let bestI = 0; let bestJ = 1; let bestValue = 0; let hasBest = false;
     ```

6) `row.key` does not exist on type 'never'
   - Cause: `row` is `Record<string, unknown>` and `row.key` is unsafe.
   - Fix: use bracket lookup with fallback:
     ```
     const label = String(row["key"] ?? row["label"] ?? row["group"] ?? "groupe");
     ```

7) ChartGroup shape mismatch
   - Error: `group.keys` / `group.title` does not exist.
   - Fix: use `group.key` and `group.label` as defined in `ChartGroup`.

8) `Property 'lateral' does not exist` after deriving shot objects
   - Cause: TS inferred a narrow object type for derived shots.
   - Fix: explicitly type derived collection as `Array<Record<string, unknown>>`.

9) Handler signature mismatch for `onClick`
   - Error: function expects a payload, but React passes mouse event.
   - Fix: wrap in arrow:
     ```
     onClick={() => openPremiumModal()}
     ```

## Patterns to use going forward

- Prefer `entry !== null` / `item !== null` for filters in TS
- If you build arrays with `map` returning `null`, always use a predicate type guard
  that matches the exact required type (no optional vs required mismatch).
- For optional objects (like `metrics.foo`), always store in a local variable and
  guard once.
- Avoid `obj.prop` on `Record<string, unknown>`; use `obj["prop"]`.
- If TS infers `never` in a reduce, switch to `hasBest` + scalar vars.
- In JSX handlers, always pass a function with zero params unless you really need the event.

## Quick checklist before deploy

- `rg "=> !!" src` and replace with explicit boolean guards when types are involved.
- `rg "metrics\\..*\\.key" src/app/app/_components/radar-charts.tsx` to ensure locals are used.
- `npx tsc --noEmit` locally.

