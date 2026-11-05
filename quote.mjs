/**
 * Exact TIAMAT quote — a faithful port of gc_tiamat_cost / gc_tiamat_tokens_for
 * from the sealed core (stf/gc_curve.inc, stf/gc_stf.c).
 *
 * The core exposes no quote view. This is the same arithmetic, so a front-end
 * can show the real number instead of an estimate.
 *
 * Uses BigInt throughout — the numbers exceed 2^53.
 */

export const CURVE = [100000000000000, 112783848556169, 127201964951407, 143463271511265,
 161803398874990, 182488100345901, 205817102727150, 232128449442482,
 261803398874990, 295271948902070, 333019067678557, 375591720953747,
 423606797749979, 477760049247971, 538836170405706, 607720170396228,
 685410196624969, 773031998150040, 871855238084262, 983311891349974,
 1109016994374948, 1250792047398010, 1410691408489967, 1591032061746201,
 1794427190999916, 2023824045548049, 2282546646574229, 2574343953096175,
 2903444185374864, 3274616092946059, 3693238055064196, 4165376014842375,
 4697871376374780, 5298440138494107, 5975784701638424, 6739719967938549,
 7601315561749643, 8573056231440165, 9669022756702619, 10905095982780924,
 12299186938124422, 13871496369934272, 15644807458341042, 17644815950719473,
 19900502499874065, 22444552601374437, 25313830215043661, 28549911933500396,
 32199689437998486, 36316048971308709, 40958637673384703, 46194727884219868,
 52100191937872550, 58760601572683145, 66272467888428363, 74744639817720263,
 84299881375871036, 95076650543991853, 107231105561813065, 120939367701940131,
 136400073313743586, 153837252116674997, 173503573450241428, 195684007519660394,
 220699954689614622, 248913902660666850, 280734679012054492, 316623375221600524,
 357100028003358208, 402751154777341847, 454238252462295920, 512307382741260918,
 577799982692972829, 651665057438008696, 734972931474350412, 828930757962861442,
 934900010696331037, 1054416212215350542, 1189211183936646331, 1341238140704122359,
 1512699993389303865, 1706081269653359238, 1924184115410996742, 2170168898666983801,
 2447600004085634901,];

export const CAP_WHOLE = 144000000000n;
export const DECIMALS = 24;
export const CAP = CAP_WHOLE * 10n ** BigInt(DECIMALS);
const SCALE = 10n ** 14n;
const SEGS = 84n;

const divCeil = (a, b) => (a + b - 1n) / b;

/** yocto of NEAR backing needed to issue [frm, to). Port of gc_tiamat_cost. */
export function cost(frm, to) {
  frm = BigInt(frm); to = BigInt(to);
  if (frm >= to) return 0n;
  if (to > CAP) throw new Error('beyond cap');
  const w = CAP / SEGS;
  const w2 = 2n * w;
  let total = 0n, a = frm;
  while (a < to) {
    const j = a / w >= SEGS ? SEGS - 1n : a / w;
    const jw = j * w;
    const e = j === SEGS - 1n ? to : (jw + w > to ? to : jw + w);
    const lo = a - jw;
    const mid2 = (e - jw) + lo;
    const d = BigInt(CURVE[Number(j) + 1]) - BigInt(CURVE[Number(j)]);
    const t = divCeil(d * mid2, w2);
    const avg = BigInt(CURVE[Number(j)]) + t + 1n;
    total += divCeil((e - a) * avg, SCALE);
    a = e;
  }
  return total;
}

/** The most TIAMAT (base units) `valueYocto` backs at supply `supply`. */
export function tokensFor(valueYocto, supply) {
  valueYocto = BigInt(valueYocto); supply = BigInt(supply);
  if (valueYocto <= 0n) return 0n;
  const head = CAP - supply;
  if (head <= 0n) return 0n;
  let lo = 0n, hi = head;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (cost(supply, supply + mid) <= valueYocto) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/** Current NEAR per whole TIAMAT, as a float. */
export function priceAt(supply) {
  supply = BigInt(supply);
  const j = supply * SEGS / CAP;
  return Number(CURVE[Number(j >= SEGS ? SEGS - 1n : j)]) / 1e14;
}

/** Convenience: human NEAR in -> human TIAMAT out. */
export function quote(nearAmount, supplyBaseUnits) {
  const yocto = BigInt(Math.round(Number(nearAmount) * 1e6)) * 10n ** 18n;
  const out = tokensFor(yocto, supplyBaseUnits);
  return Number(out) / 1e24;
}
