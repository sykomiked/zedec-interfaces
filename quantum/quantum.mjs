/**
 * Exact period finding and Shor post-processing — a port of the core's
 * OP_QPERIOD (VERIFY / FACTOR / CYCLE) from stf/gc_quantum.c.
 *
 * The contract never runs a quantum computer. It does the classical half
 * exactly: verify that r is the multiplicative order of a mod N, then run
 * Shor's classical post-processing to factor N.
 *
 * All arithmetic is BigInt. Deterministic. No floating point.
 */

export const LIMITS = { R_MAX: 1 << 24, STATES: 64 };

/** a^e mod n, by square-and-multiply. */
export function powmod(a, e, n) {
  a = BigInt(a) % BigInt(n); e = BigInt(e); n = BigInt(n);
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * a) % n;
    a = (a * a) % n;
    e >>= 1n;
  }
  return r;
}

/** gcd. */
export function gcd(a, b) {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * VERIFY: find the multiplicative order r of a mod N, minimal.
 * Returns { verdict, order, checks } where verdict is 'TRUE' | 'FALSE' | 'NEITHER'.
 */
export function verify(a, N) {
  a = BigInt(a); N = BigInt(N);
  if (N < 2n || a <= 0n || a >= N) return { verdict: 'NEITHER', order: 0n, reason: 'a must satisfy 0 < a < N' };
  if (gcd(a, N) !== 1n) return { verdict: 'FALSE', order: 0n, reason: 'gcd(a, N) != 1 — a shares a factor with N' };
  let r = 1n, x = a % N;
  const cap = BigInt(LIMITS.R_MAX);
  while (x !== 1n) {
    x = (x * a) % N;
    r++;
    if (r > cap) return { verdict: 'NEITHER', order: 0n, reason: 'order exceeds 2^24 bound' };
  }
  // minimality: for every prime p | r, a^(r/p) != 1
  const checks = [];
  let m = r, minimal = true;
  for (let p = 2n; p * p <= m; p++) {
    if (m % p === 0n) {
      while (m % p === 0n) m /= p;
      const v = powmod(a, r / p, N);
      checks.push({ prime: p.toString(), 'a^(r/p) mod N': v.toString(), passes: v !== 1n });
      if (v === 1n) minimal = false;
    }
  }
  if (m > 1n) {
    const v = powmod(a, r / m, N);
    checks.push({ prime: m.toString(), 'a^(r/p) mod N': v.toString(), passes: v !== 1n });
    if (v === 1n) minimal = false;
  }
  if (!minimal) return { verdict: 'FALSE', order: r, checks, reason: 'r is not minimal' };
  if (powmod(a, r, N) !== 1n) return { verdict: 'FALSE', order: r, checks, reason: 'a^r != 1 mod N' };
  return { verdict: 'TRUE', order: r, checks, reason: 'r is the minimal period' };
}

/**
 * FACTOR: Shor's classical post-processing.
 * gcd(a^(r/2) - 1, N) and gcd(a^(r/2) + 1, N).
 */
export function factor(a, N, r) {
  a = BigInt(a); N = BigInt(N); r = BigInt(r);
  if (r === 0n || r % 2n !== 0n) {
    return { verdict: 'NEITHER', reason: 'r must be even for Shor post-processing', factors: [] };
  }
  const half = powmod(a, r / 2n, N);
  if (half === N - 1n || half === 1n) {
    return { verdict: 'FALSE', reason: 'a^(r/2) is ±1 — this a gives no factor, pick another base', factors: [] };
  }
  const p = gcd(half - 1n, N);
  const q = gcd(half + 1n, N);
  const factors = [p, q].filter(f => f > 1n && f < N);
  if (!factors.length) return { verdict: 'FALSE', reason: 'no nontrivial factor from this base', factors: [] };
  const broken = factors.every(f => N % f === 0n);
  return {
    verdict: broken ? 'TRUE' : 'FALSE',
    reason: broken ? 'modulus factored' : 'factors do not divide N',
    'a^(r/2) mod N': half.toString(),
    factors: [...new Set(factors.map(String))],
  };
}

/**
 * CYCLE: the period (mu, lambda) of a bounded window of u64 states,
 * Brent-style. An external chain's load states, for example.
 */
export function cycle(states) {
  if (!Array.isArray(states) || states.length < 2) return { verdict: 'NEITHER', reason: 'need at least 2 states' };
  if (states.length > LIMITS.STATES) return { verdict: 'NEITHER', reason: `at most ${LIMITS.STATES} states` };
  const seen = new Map();
  let mu = -1, lambda = 0;
  for (let i = 0; i < states.length; i++) {
    const k = String(states[i]);
    if (seen.has(k)) { mu = seen.get(k); lambda = i - mu; break; }
    seen.set(k, i);
  }
  if (mu < 0) return { verdict: 'NEITHER', reason: 'no cycle within the window' };
  return { verdict: 'TRUE', mu, lambda, reason: `cycle of length ${lambda} starting at ${mu}` };
}

/** The core's boot self-check, reproduced. */
export function bootSelfCheck() {
  const v = verify(2, 15);
  const f = factor(2, 15, v.order);
  const c = cycle([1, 2, 3, 1, 2, 3]);
  return {
    verify: { order: v.order.toString(), verdict: v.verdict, pass: v.verdict === 'TRUE' && v.order === 4n },
    factor: { factors: f.factors, verdict: f.verdict, pass: f.factors.join('x') === '3x5' },
    cycle: { mu: c.mu, lambda: c.lambda, verdict: c.verdict, pass: c.mu === 0 && c.lambda === 3 },
    allPass: v.verdict === 'TRUE' && v.order === 4n && f.factors.join('x') === '3x5' && c.mu === 0 && c.lambda === 3,
  };
}
