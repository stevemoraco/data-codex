# Independent Lean replay: BSD hyperbolic Lagrangian gauge

This directory is a clean public replay of the finite-algebra theorem committed in the private Millennium theorem bank at:

- repository: `stevemoraco/RH-Lean`
- branch: `bsd/hyperbolic-gauge-20260812`
- original source commit: `a5f5796222105e24f67ff7d34dd6b66e4c671563`
- research-note commit: `a451a5c923562190bf58aafe4c8b226e0fb40ac6`

It is **not** a proof of the Birch--Swinnerton-Dyer conjecture. It kernel-checks the formal core of a rigorous obstruction: a hyperbolic rank-two module with two labelled Lagrangian coordinate lines has a full unit-valued diagonal pairing stabilizer `diag(u,u⁻¹)`. Therefore pairing normalization alone cannot canonically choose either signed basis.

## Reproducible environment

- Lean: `v4.31.0`
- Mathlib: tag `v4.31.0`, commit `fabf563a7c95a166b8d7b6efca11c8b4dc9d911f`

## Replay

```bash
cd formal-replay/bsd-hyperbolic-gauge
lake update
lake exe cache get
lake env lean BSDHyperbolicGaugeReplay/Basic.lean
lake build
```

The source ends with `#print axioms` commands for its load-bearing theorems. The workflow also runs `nanoda` with `sorryAx` forbidden.
