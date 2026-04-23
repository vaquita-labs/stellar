# Contracts

[![Contracts CI](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml/badge.svg?branch=main)](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml)

This directory contains the Soroban contracts workspace.

## Run tests

From `contracts/`:

```bash
cargo test --workspace
```

Or from `contracts/vaquita-pool/`:

```bash
make test
```

## Generate coverage locally

Coverage is produced from host-side Rust tests using `cargo-llvm-cov`.

1. Install tool once:

```bash
cargo install cargo-llvm-cov --locked
```

2. Run coverage from `contracts/vaquita-pool/`:

```bash
make coverage
```

Generated files:

- `contracts/lcov.info` (LCOV report)
- `contracts/coverage-html/` (HTML report)

Open HTML report locally:

```bash
open contracts/coverage-html/index.html
```

## CI coverage

GitHub Actions workflow: `.github/workflows/contracts-ci.yml`

On pushes/PRs that touch `contracts/**`, CI runs:

- contract tests
- `stellar contract build` sanity build
- `cargo llvm-cov` coverage generation

Artifacts uploaded by CI:

- `contracts-lcov`
- `contracts-coverage-html`

Download artifacts from the workflow run page to inspect coverage results.
