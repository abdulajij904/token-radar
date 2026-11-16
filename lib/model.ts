// Token Radar's value model ("radar-2"): one sealed snapshot in, one ranked board out.
//
// The board ranks pre-token protocols only: a protocol is pre-token when its snapshot record carries
// no token (both gecko_id and symbol are null). It covers every slug on the snapshot's watchlist, then
// adds the other pre-token protocols with the most TVL that are not a wrapped, staked or bridged
// product of a token that already trades and not an exchange: the categories Bridge, Canonical Bridge,
// Liquid Staking, Liquid Restaking, Restaked BTC and CEX are set aside, as are names ending in a
// version marker (a "V2" deployment is a pool of another protocol, not a launch candidate).
//
// Implied value is one function of the snapshot's own figures, the same for every protocol:
//
//   implied = round( tvl_usd
//                    x category_multiple   what a launched token in this category is worth per $1 of TVL
//                    x growth_factor       exp(0.55 x trusted change_7d / 100), the change clamped to
//                                          [-80, 200] and discounted by a size-trust term (below)
//                    x maturity_factor     0.55 + 0.45 x (1 - exp(-age_days / 900)); unknown age = 540d
//                    x breadth_factor      1 + 0.055 x log2(chains), one chain = 1
//                    x scale_factor )      (tvl_usd / 1e8)^-0.06, clamped to [0.6, 1.5]
//
// Growth is answered exponentially so a doubling week is worth more than two +50% weeks and a crash
// week is punished smoothly, with no cliff at the clamps — but a weekly change is only as believable
// as the TVL it moves, so the change is first multiplied by tvl / (tvl + $25M): at $5M of TVL a
// doubling week counts for a sixth of its face value, at $500M almost in full. Maturity saturates: a protocol that has run
// three years with no token is a stronger launch candidate than a three-month one, but the tenth year
// adds little the third did not. Breadth pays for distribution a token can launch into. Scale bends
// the multiple down as TVL grows, because launched tokens trade at lower value-to-TVL ratios the
// larger the protocol already is. No protocol's name is ever read by the model: two protocols with
// the same figures get the same score, and near-identical figures give near-identical values.

/** One protocol as the snapshot carries it: exactly ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label, stated in the dashboard and the README. */
export const MODEL_VERSION = 'radar-2';

/** The model's constants, stated where a reader can check them. */
export const MODEL = {
  growth_rate: 0.55,
  growth_floor_pct: -80,
  growth_cap_pct: 200,
  growth_trust_usd: 25_000_000,
  maturity_base: 0.55,
  maturity_span: 0.45,
  maturity_tau_days: 900,
  unknown_age_days: 540,
  breadth_per_doubling: 0.055,
  scale_reference_usd: 100_000_000,
  scale_exponent: -0.06,
  scale_min: 0.6,
  scale_max: 1.5,
  default_multiple: 0.7,
} as const;

/** What a launched token is worth per $1 of TVL, by the protocol's category. */
const CATEGORY_MULTIPLES: Record<string, number> = {
  'Chain': 1.5,
  'Prediction Market': 1.4,
  'Derivatives': 1.3,
  'Decentralized AI': 1.3,
  'AI Agents': 1.3,
  'Launchpad': 1.2,
  'Interest Rate Derivatives': 1.2,
  'Options': 1.2,
  'Dexs': 1.1,
  'Privacy': 1.1,
  'Payments': 1.0,
  'Crypto Card Issuer': 1.0,
  'Synthetics': 1.0,
  'Options Vault': 1.0,
  'RWA': 0.9,
  'NFT Marketplace': 0.9,
  'OTC Marketplace': 0.9,
  'Lending': 0.85,
  'Restaking': 0.85,
  'CDP': 0.8,
  'CDP Manager': 0.8,
  'Uncollateralized Lending': 0.8,
  'Insurance': 0.8,
  'DOR': 0.8,
  'Risk Curators': 0.75,
  'Onchain Capital Allocator': 0.75,
  'Collateral Management': 0.75,
  'Collateral Markets': 0.75,
  'Stablecoin Issuer': 0.75,
  'Basis Trading': 0.7,
  'Decentralized BTC': 0.7,
  'Indexes': 0.7,
  'CeDeFi': 0.7,
  'Algo-Stables': 0.65,
  'Dual-Token Stablecoin': 0.65,
  'Staking Pool': 0.6,
  'Anchor BTC': 0.6,
  'Token Locker': 0.6,
  'Governance Incentives': 0.6,
  'Reserve Currency': 0.6,
  'Yield': 0.55,
  'Cross Chain Bridge': 0.55,
  'Liquidity Manager': 0.55,
  'Yield Aggregator': 0.5,
  'Leveraged Farming': 0.5,
  'Stablecoin Wrapper': 0.5,
  'Farm': 0.45,
};

/** Keyword fallbacks for a category the table does not name, tried in order. */
const CATEGORY_KEYWORDS: [string, number][] = [
  ['perpetual', 1.25],
  ['derivative', 1.25],
  ['option', 1.15],
  ['dex', 1.1],
  ['swap', 1.1],
  ['lend', 0.85],
  ['restak', 0.85],
  ['cdp', 0.8],
  ['rwa', 0.9],
  ['real world', 0.9],
  ['stable', 0.65],
  ['stak', 0.6],
  ['yield', 0.55],
  ['farm', 0.5],
  ['bridge', 0.55],
  ['vault', 0.55],
  ['ai', 1.25],
];

/** The category multiple for one protocol: the table, then keywords, then the default. */
export function categoryMultiple(category: string | null): number {
  if (category !== null) {
    const exact = CATEGORY_MULTIPLES[category];
    if (exact !== undefined) return exact;
    const c = category.toLowerCase();
    for (const [word, multiple] of CATEGORY_KEYWORDS) if (c.includes(word)) return multiple;
  }
  return MODEL.default_multiple;
}

/** A protocol records no token: the radar's whole subject. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Categories that are a product of a token that already trades, or an exchange: never launch candidates. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name ending in a release marker: a deployment of another protocol. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a pre-token protocol outside the watchlist may join the board. */
export function isEligible(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !WRAPPED_CATEGORIES.has(p.category ?? '') && !VERSIONED_NAME.test(p.name);
}

const DAY_MS = 86_400_000;

/** Whole days from the protocol's listing day to the snapshot's day; null when either is unusable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The score's factors of one protocol, and the value itself. */
export interface Score {
  implied_value_usd: number;
  category_multiple: number;
  growth_factor: number;
  growth_trust: number;
  maturity_factor: number;
  breadth_factor: number;
  scale_factor: number;
  age_days: number | null;
}

/** Score one protocol from its snapshot figures alone. */
export function score(p: SnapshotProtocol, asOf: string): Score {
  const age = ageDays(asOf, p.listed_at);
  const multiple = categoryMultiple(p.category);
  const rawPct = Math.min(MODEL.growth_cap_pct, Math.max(MODEL.growth_floor_pct, p.change_7d ?? 0));
  const trust = p.tvl_usd / (p.tvl_usd + MODEL.growth_trust_usd);
  const growth = Math.exp((MODEL.growth_rate * rawPct * trust) / 100);
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturity = MODEL.maturity_base + MODEL.maturity_span * (1 - Math.exp(-ageForModel / MODEL.maturity_tau_days));
  const breadth = 1 + MODEL.breadth_per_doubling * Math.log2(Math.max(1, p.chains.length));
  const rawScale = Math.pow(p.tvl_usd / MODEL.scale_reference_usd, MODEL.scale_exponent);
  const scale = Math.min(MODEL.scale_max, Math.max(MODEL.scale_min, rawScale));
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity * breadth * scale));
  return {
    implied_value_usd: implied,
    category_multiple: multiple,
    growth_factor: growth,
    growth_trust: trust,
    maturity_factor: maturity,
    breadth_factor: breadth,
    scale_factor: scale,
    age_days: age,
  };
}

/** One row of the board: the protocol, its score and its farm plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_factor: number;
    growth_trust: number;
    maturity_factor: number;
    breadth_factor: number;
    scale_factor: number;
  };
  farm_steps: string[];
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * The board: every watchlist protocol, plus every other eligible pre-token protocol in TVL order,
 * scored and ranked. Deterministic: ties fall to TVL, then to the slug.
 */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen: SnapshotProtocol[] = [];
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.push(p);
  }
  const rest = snapshot.protocols
    .filter((p) => !watch.has(p.slug) && isEligible(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  chosen.push(...rest);

  const scored = chosen.map((p) => ({ p, s: score(p, snapshot.as_of) }));
  scored.sort(
    (a, b) =>
      b.s.implied_value_usd - a.s.implied_value_usd ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map(({ p, s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: s.age_days,
    on_watchlist: watch.has(p.slug),
    implied_value_usd: s.implied_value_usd,
    model: {
      category_multiple: round4(s.category_multiple),
      growth_factor: round4(s.growth_factor),
      growth_trust: round4(s.growth_trust),
      maturity_factor: round4(s.maturity_factor),
      breadth_factor: round4(s.breadth_factor),
      scale_factor: round4(s.scale_factor),
    },
    farm_steps: farmSteps(p, s.age_days),
  }));
}

// ------------------------------------------------------------------ farm plans
//
// A plan is assembled from the protocol's own record: its category picks the playbook (the core
// position, the second action, the weekly rhythm), its first chain picks the gas asset and the fee
// scale, its TVL picks the capital, its age picks the hold, and its chain count adds a cross-chain
// step. Wording variants are picked by a hash of the slug, so the same protocol always reads the
// same and two protocols rarely read alike. No name is ever special-cased.

/** FNV-1a over the slug: a stable per-protocol pick among wording variants. */
function slugHash(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface GasInfo {
  asset: string;
  note: string;
}

const GAS_BY_CHAIN: Record<string, GasInfo> = {
  Ethereum: { asset: 'ETH', note: 'about $5-9 per transaction at ordinary gas prices' },
  Solana: { asset: 'SOL', note: 'a few cents per transaction' },
  Binance: { asset: 'BNB', note: 'about $0.10-0.20 per transaction' },
  Base: { asset: 'ETH', note: 'about $0.05-0.30 per transaction' },
  Arbitrum: { asset: 'ETH', note: 'about $0.05-0.30 per transaction' },
  Optimism: { asset: 'ETH', note: 'about $0.05-0.30 per transaction' },
  Linea: { asset: 'ETH', note: 'about $0.05-0.30 per transaction' },
  Scroll: { asset: 'ETH', note: 'about $0.05-0.30 per transaction' },
  Mantle: { asset: 'MNT', note: 'a few cents per transaction' },
  Polygon: { asset: 'POL', note: 'a few cents per transaction' },
  Avalanche: { asset: 'AVAX', note: 'about $0.20-0.40 per transaction' },
  Sui: { asset: 'SUI', note: 'a few cents per transaction' },
  Aptos: { asset: 'APT', note: 'a few cents per transaction' },
  Tron: { asset: 'TRX', note: 'about $1 per contract call in energy and bandwidth' },
  Bitcoin: { asset: 'BTC', note: 'about $1-3 per transaction, depending on the mempool' },
  Near: { asset: 'NEAR', note: 'a few cents per transaction' },
  Cosmos: { asset: 'ATOM', note: 'a few cents per transaction' },
};

function gasFor(chain: string): GasInfo {
  return GAS_BY_CHAIN[chain] ?? { asset: 'the native gas token', note: 'budget about $1 per transaction' };
}

/** The capital a farm position of this protocol's size is worth running, in dollars. */
function capitalFor(tvl: number): number {
  if (tvl >= 2_000_000_000) return 400;
  if (tvl >= 500_000_000) return 250;
  if (tvl >= 100_000_000) return 150;
  if (tvl >= 25_000_000) return 100;
  return 60;
}

/** How long to hold, from the protocol's age: younger protocols are scored over longer windows. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 730) return 60;
  return 45;
}

interface FarmContext {
  name: string;
  category: string | null;
  chain: string;
  secondChain: string | null;
  chainCount: number;
  capital: number;
  gas: GasInfo;
  secondGas: GasInfo;
  hold: number;
  pick: number;
}

/** The playbook's three moves for a category: open the position, deepen it, keep it alive. */
interface Playbook {
  core: (c: FarmContext) => string;
  depth: (c: FarmContext) => string;
  cadence: (c: FarmContext) => string;
}

const LENDING_PLAY: Playbook = {
  core: (c) =>
    `Supply $${c.capital} of USDC (USDT where USDC is not listed) to ${c.name}'s main market on ${c.chain} and leave the deposit untouched; lending programs score supplied balance over time, not deposit count. The supply transaction costs ${c.gas.note}.`,
  depth: (c) =>
    `Borrow once against the position, no more than 30% of its value, hold the borrowed stablecoin for two weeks and then repay in full; a wallet that has supplied, borrowed and repaid reads as a customer of ${c.name}, and the interest on a loan this size runs about $1-3.`,
  cadence: (c) =>
    `Top the supply up by $10-20 every second week rather than depositing once and going quiet; a balance that grows slowly across eight or more weeks is the pattern lender loyalty programs are built to find. Each top-up costs ${c.gas.note}.`,
};

const DEX_PLAY: Playbook = {
  core: (c) =>
    `Add $${c.capital} of liquidity to ${c.name}'s busiest stablecoin or ETH pair on ${c.chain}, split evenly between the two assets, and start with a wide range so the position does not need rebalancing; approvals plus the deposit cost ${c.gas.note} each.`,
  depth: (c) =>
    `Make three ordinary swaps a month through ${c.name} ($10-30 each, different pairs) instead of only supplying liquidity; points programs consistently weight wallets that both trade and provide over wallets that only park capital. Each swap costs ${c.gas.note}.`,
  cadence: (c) =>
    `Re-check the position weekly and re-centre the range only if the price has left it; an LP position that stays in range across two month-ends is what a retroactive program can measure. A rebalance costs ${c.gas.note}.`,
};

const PERP_PLAY: Playbook = {
  core: (c) =>
    `Deposit $${c.capital} of USDC margin into ${c.name} on ${c.chain} and open one small hedged position (a long offset by a spot holding elsewhere), so the account records genuine trading volume without directional risk. Funding on a position this size runs about $2-6 a week.`,
  depth: (c) =>
    `Close and reopen the hedge once a fortnight instead of letting a single position sit untouched; rolling activity is what a derivatives venue can tell apart from parked margin. Each roll costs about $1-3 in trading fees plus ${c.gas.note}.`,
  cadence: (c) =>
    `Trade on at least six separate days a month, even if the trades are small hedges; venues score distinct active days, and six days of small trades outrank one day of large ones. Budget about $2 a day in fees.`,
};

const VAULT_PLAY: Playbook = {
  core: (c) =>
    `Deposit $${c.capital} of USDC into ${c.name}'s flagship vault on ${c.chain} — the one with the most deposits, not the highest advertised APY — and keep the vault shares in the same wallet; vault programs are scored on share balance at weekly snapshots. The deposit costs ${c.gas.note}.`,
  depth: (c) =>
    `Put 30% of the position into a second ${c.name} vault${c.secondChain !== null ? ` on ${c.secondChain}` : ''} after the first month; using two of the protocol's products reads as a customer of the protocol, not of one vault's rate. The second deposit costs ${c.gas.note}.`,
  cadence: (c) =>
    `Claim rewards only when they pass $5 and re-deposit them into the same vault; small weekly claims make a wallet's history mostly claim transactions, which scoring models discount. A claim costs ${c.gas.note}.`,
};

const CDP_PLAY: Playbook = {
  core: (c) =>
    `Open a small vault in ${c.name} on ${c.chain}: deposit $${c.capital} of the chain's main collateral asset and mint no more than 35% of its value in the protocol's stablecoin, so a sharp drawdown cannot liquidate you. Opening and minting cost ${c.gas.note} each, and the stability fee accrues slowly in the background.`,
  depth: (c) =>
    `Hold the minted stablecoin, or deposit it in ${c.name}'s own stability pool, rather than swapping it away the same day; a minter who also holds the stablecoin is the user a CDP protocol most wants to keep. The stability deposit costs ${c.gas.note}.`,
  cadence: (c) =>
    `Check the vault's collateral ratio weekly and top the collateral up if it drifts under 200%; one five-minute check a week, costing ${c.gas.note} only when a top-up is needed, keeps the position — and its history — alive.`,
};

const STAKE_PLAY: Playbook = {
  core: (c) =>
    `Stake $${c.capital} of the underlying asset through ${c.name} on ${c.chain} and keep the receipt in the same wallet; staking-derived programs count the receipt balance and how long it has been held. Staking costs ${c.gas.note}, and unstaking usually sits in a queue of several days.`,
  depth: (c) =>
    `Use the receipt once as collateral or in a pool ${c.name} itself points to, at no more than a third of its value; a receipt that has been both held and used is a stronger record than either alone. The extra transaction costs ${c.gas.note}.`,
  cadence: (c) =>
    `Add $10-25 to the stake every month and claim rewards only above $5; a stake that grows monthly for a quarter is the holding pattern these programs snapshot for. Each addition costs ${c.gas.note}.`,
};

const RWA_PLAY: Playbook = {
  core: (c) =>
    `Mint $${c.capital} of ${c.name}'s tokenised treasury or credit asset through its own app on ${c.chain} and hold it; RWA issuers reward holders of record, and secondary-market buys do not always count the same way. Minting costs ${c.gas.note}, plus any investor verification the issuer asks for (about 15 minutes).`,
  depth: (c) =>
    `Put a quarter of the minted position to work in ${c.name}'s own lending or liquidity product if it offers one, and keep the rest idle in the wallet; holders who also use the asset are the minority every issuer notices. The extra deposit costs ${c.gas.note}.`,
  cadence: (c) =>
    `Hold across at least two coupon or yield payment dates without selling; payment dates are the natural snapshot points for an issuer, and a holder of record on two of them has a record a flipper cannot fake. Checking the position costs nothing.`,
};

const CHAIN_PLAY: Playbook = {
  core: (c) =>
    `Bridge $${c.capital} of ETH or USDC to ${c.chain} through the canonical route and keep it there; a chain's own token, when it comes, goes to residents. Bridging in costs the source chain's fee plus ${c.gas.note} on arrival.`,
  depth: (c) =>
    `Make three ordinary transactions on ${c.chain} in the first week — a swap, a small lending supply and a transfer to a second wallet of yours — so the address reads as a resident with a history, not a passer-by with a balance. Each costs ${c.gas.note}.`,
  cadence: (c) =>
    `Transact on ${c.chain} at least twice a month and keep the bridged balance above $${Math.round(c.capital / 2)}; chains score distinct active months and average balances, and both decay if the wallet goes quiet. Each active day costs ${c.gas.note}.`,
};

const BRIDGE_PLAY: Playbook = {
  core: (c) =>
    `Bridge $${c.capital} of USDC from Ethereum to ${c.secondChain ?? c.chain} through ${c.name}, then use the funds in one app on the far side before bridging anything back; bridge programs score routes completed and destination activity, not round trips. Each hop costs ${c.gas.note} plus the bridge's own fee of roughly 0.1%.`,
  depth: (c) =>
    `Bridge back a smaller amount ($25-50) a month later over a different route if ${c.name} offers one; two routes and two directions is a usage pattern, one large round trip is not. The return hop costs ${c.gas.note} plus the route fee.`,
  cadence: (c) =>
    `Bridge once a month for a quarter, varying the amount between $25 and $${c.capital}; regular, varied crossings are what bridge loyalty programs are built to count. Budget about 0.1% plus ${c.gas.note} per crossing.`,
};

const GENERIC_PLAY: Playbook = {
  core: (c) =>
    `Deposit $${c.capital} of USDC into ${c.name}'s main product on ${c.chain} and keep the position open; for a protocol of this kind, balance held over time is the one signal every distribution model shares. The deposit costs ${c.gas.note}.`,
  depth: (c) =>
    `Use one second feature of ${c.name} within the first month — its other pool, its staking module or its governance vote — so your history is not a single deposit and nothing else. Budget ${c.gas.note} for the extra transaction.`,
  cadence: (c) =>
    `Return once a fortnight for one small action (a top-up, a claim or a vote) across the next three months; steady fortnightly presence across a quarter is the cheapest pattern that separates a user from a drive-by deposit. Each visit costs ${c.gas.note}.`,
};

/** Pick the playbook for a category: exact families first, then keywords. */
function playbookFor(category: string | null): Playbook {
  const c = (category ?? '').toLowerCase();
  if (c === 'lending' || c === 'uncollateralized lending' || c === 'collateral markets' || c === 'collateral management') return LENDING_PLAY;
  if (c === 'dexs') return DEX_PLAY;
  if (c === 'derivatives' || c === 'interest rate derivatives' || c === 'synthetics' || c === 'options' || c === 'options vault') return PERP_PLAY;
  if (c === 'cdp' || c === 'cdp manager') return CDP_PLAY;
  if (c === 'staking pool' || c === 'restaking') return STAKE_PLAY;
  if (c === 'rwa') return RWA_PLAY;
  if (c === 'chain') return CHAIN_PLAY;
  if (c === 'cross chain bridge') return BRIDGE_PLAY;
  if (c.includes('yield') || c.includes('vault') || c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager') || c.includes('indexes') || c.includes('farm')) return VAULT_PLAY;
  if (c.includes('lend')) return LENDING_PLAY;
  if (c.includes('dex') || c.includes('swap')) return DEX_PLAY;
  if (c.includes('stak')) return STAKE_PLAY;
  if (c.includes('stable')) return CDP_PLAY;
  return GENERIC_PLAY;
}

/** One-off core actions for categories with a distinctive first move; the playbook still frames the rest. */
function specialCore(category: string | null, c: FarmContext): string | null {
  const cat = (category ?? '').toLowerCase();
  if (cat === 'prediction market')
    return `Fund $${c.capital} of USDC on ${c.chain} and take small positions in three liquid markets on ${c.name}, $10-25 each; steady participation across many markets is what these platforms can measure, and one large bet reads as gambling, not usage. Each trade costs ${c.gas.note}.`;
  if (cat === 'insurance')
    return `Buy $${c.capital} of cover from ${c.name} on ${c.chain} against a position you actually hold (a lending deposit or an LP position) and keep the policy to expiry; cover buyers are the scarcest users an insurer has. The premium on a policy this size runs about 2-4% per quarter.`;
  if (cat === 'launchpad')
    return `Register the wallet on ${c.name} and complete one small allowlist or participation deposit of about $${Math.round(c.capital / 3)} on ${c.chain} before any sale opens; launchpads score the wallets that showed up early, not the ones that arrived with the crowd. Registration costs ${c.gas.note}.`;
  if (cat === 'payments' || cat === 'crypto card issuer')
    return `Open an account with ${c.name}, complete its verification (about 15 minutes) and route one real payment of $25-50 through it from ${c.chain}; payment products score transacting users, and a funded but idle account is indistinguishable from a sybil.`;
  if (cat === 'nft marketplace')
    return `List one NFT you already own for sale on ${c.name} and make one purchase under $25 on ${c.chain}; marketplaces score two-sided users, and volume washed between your own wallets is the pattern they filter for. Listing and buying cost ${c.gas.note} each.`;
  if (cat === 'privacy')
    return `Make two small shielded deposits of about $${Math.round(c.capital / 2)} each into ${c.name} on ${c.chain}, a week apart, and leave the notes unspent for at least 30 days; privacy pools measure set membership over time, and instant in-and-out activity is exactly what they discount. Each deposit costs ${c.gas.note}.`;
  if (cat === 'ai agents' || cat === 'decentralized ai')
    return `Fund the wallet with $${c.capital} of USDC on ${c.chain} and use ${c.name}'s service for one real task a week (a routed swap, a data job or an automated strategy); usage-metered platforms score spend and sessions, not deposits. Each session costs ${c.gas.note} plus the service's own fee.`;
  if (cat === 'token locker')
    return `Lock a small amount — about $${Math.round(c.capital / 4)} of a token you already hold — in ${c.name} on ${c.chain} for six months; locker protocols score locked value multiplied by duration, and a six-month lock is a signal a six-day one is not. The lock transaction costs ${c.gas.note}.`;
  if (cat === 'basis trading')
    return `Fund $${c.capital} of USDC into ${c.name} on ${c.chain} and let the strategy open its hedged basis position; basis programs are scored on capital at work over time, so deposit once and resist topping up and withdrawing in the same week. The deposit costs ${c.gas.note}.`;
  return null;
}

/** Assemble one protocol's farm plan: 5 steps, 6 when it lives on three or more chains. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const ctx: FarmContext = {
    name: p.name,
    category: p.category,
    chain,
    secondChain,
    chainCount: p.chains.length,
    capital: capitalFor(p.tvl_usd),
    gas: gasFor(chain),
    secondGas: gasFor(secondChain ?? chain),
    hold: holdDaysFor(age),
    pick: slugHash(p.slug),
  };
  const play = playbookFor(p.category);
  const setup =
    ctx.pick % 2 === 0
      ? `Create a fresh wallet for ${p.name} and fund it on ${chain} with ${ctx.gas.asset} for fees plus the funds you plan to commit; a wallet that also holds your main balances mixes your history and your risk. Setup takes about 20 minutes, and the first funding transaction costs ${ctx.gas.note}.`
      : `Use a dedicated wallet that has never been connected to claim sites, and send it ${ctx.gas.asset} on ${chain} for gas before anything else. One wallet per protocol family keeps your activity legible and a loss containable; funding it costs ${ctx.gas.note}.`;
  const core = specialCore(p.category, ctx) ?? play.core(ctx);
  const steps = [setup, core, play.depth(ctx), play.cadence(ctx)];
  if (p.chains.length >= 3 && secondChain !== null) {
    steps.push(
      `Repeat a quarter-size version of the position on ${secondChain}: ${p.name} records TVL on ${p.chains.length} chains, and multi-chain users are the minority every distribution model rewards. The second position ties up about $${Math.round(ctx.capital / 4)} and costs ${ctx.secondGas.note}.`,
    );
  }
  steps.push(
    `Hold the position for at least ${ctx.hold} days, spanning two month-ends, before withdrawing anything; retroactive programs snapshot monthly, and exiting the week before a snapshot is the classic way to farm for nothing. When the time comes, withdraw only through ${p.name}'s own app — never pay a third party to unlock a claim.`,
  );
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 597)}...` : s));
}

// ------------------------------------------------------------------ input and checks

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The snapshot out of a file's text, refused unless it has the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('the snapshot is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('the snapshot is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('the snapshot has no as_of date');
  if (typeof o.source !== 'string' || o.source.length === 0) throw new SnapshotError('the snapshot has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isFinite(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('the snapshot has no usable floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('the snapshot has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('the snapshot watchlist is not a list of slugs');
  const protocols: SnapshotProtocol[] = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const q = v as Record<string, unknown>;
    if (typeof q.slug !== 'string' || typeof q.name !== 'string' || typeof q.tvl_usd !== 'number' || !Number.isFinite(q.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} lacks a slug, a name or a TVL`);
    }
    const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);
    return {
      slug: q.slug,
      name: q.name,
      category: str(q.category),
      chains: Array.isArray(q.chains) ? q.chains.filter((x): x is string => typeof x === 'string') : [],
      tvl_usd: q.tvl_usd,
      change_7d: num(q.change_7d),
      mcap_usd: num(q.mcap_usd),
      listed_at: str(q.listed_at),
      gecko_id: str(q.gecko_id),
      symbol: str(q.symbol),
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board fails the gate's shape, or null when it passes: coverage, ranks, order, spread, steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `slug ${r.slug} appears twice`;
    seen.add(r.slug);
  }
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `ranks are not exactly 1..${byRank.length}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `implied value rises at rank ${i + 1}`;
  }
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) return 'every row carries the same implied value';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) {
    if (!known.has(r.slug)) return `slug ${r.slug} is not in the snapshot`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has a bad implied value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The dashboard's dataset as one script: window.RADAR, no fetch, no network. */
export function dataScript(snapshot: Snapshot, board: BoardRow[]): string {
  const data = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    rows: board,
  };
  return `window.RADAR=${JSON.stringify(data)};\n`;
}
