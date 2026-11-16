# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/abdulajij904/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/abdulajij904/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It reads one frozen snapshot of the DefiLlama protocol index and answers two
questions about every protocol that records no token yet: what would a token be worth if the
protocol's record stayed as it is, and what should a reader do to farm the protocol before one
exists? It does not predict whether or when a token launches — the implied value is the model's own
claim, stated so it can be argued with.

The board ranks 203 pre-token protocols: all 40 on the snapshot's watchlist (pre-token, at or above
its $50M TVL floor, and not a wrapped, staked or bridged product of a token that already trades),
plus the 163 other pre-token protocols with the most TVL under the same product rules — the early
rows below the floor that a radar exists to find. Protocols that already have a token are never
ranked: their value is a market fact, not a model's claim.

## The value model (radar-2)

One function of the snapshot's own figures scores every protocol; no name is ever special-cased:

```
implied value = round( TVL × category multiple × growth factor × maturity factor
                       × breadth factor × scale factor )
```

- **Category multiple** — what a launched token in this category is worth per $1 of TVL: chains 1.50,
  prediction markets 1.40, derivatives 1.30, DEXs 1.10, lending 0.85, risk curators and allocators
  0.75, yield vaults 0.50–0.55, farms 0.45, with keyword fallbacks for categories the table
  does not name and a default of 0.70.
- **Growth factor** — `exp(0.55 × change)`, the 7-day TVL change clamped to −80%…+200% and
  discounted by a size-trust term, `TVL / (TVL + $25M)`, so a doubling week at $5M of TVL barely
  moves the score while the same week at $500M counts almost in full; unreported growth counts as 0.
- **Maturity factor** — `0.55 + 0.45 × (1 − exp(−age / 900 days))`: years run with no token count,
  with diminishing returns; an unrecorded listing date counts as 540 days.
- **Breadth factor** — `1 + 0.055` per doubling of the chain count: more chains, more holders a
  token can launch into.
- **Scale factor** — `(TVL / $100M)^−0.06`, clamped to [0.6, 1.5]: launched tokens trade at lower
  value-to-TVL ratios the larger the protocol already is.

Each row also carries a farm plan of five or six concrete steps, generated from the protocol's
category, chains, TVL and age: a dedicated wallet and how to fund it, the category's core position
sized to the protocol, a second action that makes the wallet read as a customer, a weekly or
fortnightly rhythm, a cross-chain step for protocols on three or more chains, and a hold timed to
span two monthly snapshots. Costs and timeframes are stated per step, in the gas terms of the
protocol's own first chain.

The dashboard is a static page with no framework and no network: a sortable board (click any column
header), text search, category and chain filters, a watchlist-only toggle, and a detail panel per
protocol that shows its figures, its model factors, a live recomputation of its implied value from
the raw figures, and its farm plan.

## Run it

Node 22, standard library only. In the grading container the snapshot is mounted at
`/input/snapshot.json` and the hand-in is written to `/output`:

```sh
node main.ts
```

Anywhere else, name the snapshot and the output directory:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

`--input` also accepts the directory holding `snapshot.json`, and `--output` overrides the output
directory. A run writes `board.json` (the ranked board), `data.js` (the dashboard's data),
`dashboard/` and `screenshots/` (copies of this repository's), and `dossier.json` (the make.fun
dossier of the two, written last). Runs are deterministic: the same snapshot always writes the
same bytes.

---

Built for the token-radar-01 bounty on [make.fun](https://make.fun/).
