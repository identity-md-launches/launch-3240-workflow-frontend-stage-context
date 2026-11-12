import { parseUnits } from "viem";
export const Q96 = 2n ** 96n;
export function parseAmount(text: string, decimals: number) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text.trim()))
    throw Error("Enter a positive token amount.");
  if ((text.split(".")[1]?.length ?? 0) > decimals)
    throw Error(`Use at most ${decimals} decimal places.`);
  const n = parseUnits(text, decimals);
  if (n <= 0n) throw Error("Enter an amount greater than zero.");
  return n;
}
export function checkAmount(
  text: string,
  decimals: number,
  balance: bigint | undefined,
  unit: string,
) {
  try {
    const n = parseAmount(text, decimals);
    if (balance !== undefined && n > balance)
      return `This amount exceeds your ${unit} balance.`;
    return "";
  } catch (e) {
    return text ? (e as Error).message : `Enter a ${unit} amount.`;
  }
}
// Exact BigInt port of pinned src/libraries/PoolMath.sol (MIT), with identical rounding.
const tickFactors = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
];
export function sqrtTick(tick: number) {
  if (!Number.isInteger(tick) || tick < -887272 || tick > 887272)
    throw Error("Range is outside the pool’s tick limits.");
  const abs = Math.abs(tick);
  let ratio = 1n << 128n;
  for (let bit = 0; bit < tickFactors.length; bit++)
    if ((abs & (1 << bit)) !== 0) ratio = (ratio * tickFactors[bit]) >> 128n;
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}
export function tickAtSqrt(s: bigint) {
  if (s < sqrtTick(-887272) || s >= sqrtTick(887272))
    throw Error("Price is outside the pool’s tick limits.");
  let low = -887272,
    high = 887272;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (sqrtTick(mid) <= s) low = mid;
    else high = mid - 1;
  }
  return low;
}
export function sqrtBigInt(n: bigint): bigint {
  if (n < 0n) throw Error("Negative price");
  if (n < 2n) return n;
  let x = n,
    y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}
export function sqrtPrice(
  price: string,
  stockIs0: boolean,
  assetDecimals: number,
) {
  const p = parseAmount(price, 18);
  let num = p * 10n ** BigInt(assetDecimals),
    den = 10n ** 36n;
  if (!stockIs0) [num, den] = [den, num];
  return sqrtBigInt((num * Q96 * Q96) / den);
}
export function tickRange(
  low: string,
  high: string,
  stockIs0: boolean,
  assetDecimals: number,
  spacing: number,
) {
  if (!Number.isInteger(spacing) || spacing <= 0)
    throw Error("Use a valid tick spacing.");
  if (Number(low) >= Number(high))
    throw Error("The range end must be above its start.");
  const a = sqrtPrice(low, stockIs0, assetDecimals),
    b = sqrtPrice(high, stockIs0, assetDecimals);
  const lo = a < b ? a : b,
    hi = a < b ? b : a;
  const tick = (s: bigint) => tickAtSqrt(s);
  const lower = Math.floor(tick(lo) / spacing) * spacing,
    upper = Math.ceil(tick(hi) / spacing) * spacing;
  if (lower >= upper || lower < -887272 || upper > 887272)
    throw Error("Choose a wider range within the tick limits.");
  return [lower, upper] as const;
}
const up = (a: bigint, b: bigint) => (a + b - 1n) / b;
export function liquidityFrom(
  s: bigint,
  a: bigint,
  b: bigint,
  amount: bigint,
  is0: boolean,
) {
  if (a > b) [a, b] = [b, a];
  if (is0) {
    if (s >= b) return 0n;
    const start = s <= a ? a : s;
    return (amount * ((start * b) / Q96)) / (b - start);
  }
  if (s <= a) return 0n;
  return (amount * Q96) / ((s < b ? s : b) - a);
}
export function amountsFor(
  s: bigint,
  a: bigint,
  b: bigint,
  l: bigint,
  roundUp = true,
) {
  if (a > b) [a, b] = [b, a];
  const div = roundUp ? up : (a: bigint, b: bigint) => a / b;
  const amount0 = (x: bigint, y: bigint) =>
    div(div((l << 96n) * (y - x), y), x);
  const amount1 = (x: bigint, y: bigint) => div(l * (y - x), Q96);
  if (s <= a) return [amount0(a, b), 0n] as const;
  if (s < b) return [amount0(s, b), amount1(a, s)] as const;
  return [0n, amount1(a, b)] as const;
}
export function positionPreview(
  s: bigint,
  lower: number,
  upper: number,
  amount: bigint,
  stockIs0: boolean,
) {
  const a = sqrtTick(lower),
    b = sqrtTick(upper);
  let l = liquidityFrom(s, a, b, amount, stockIs0);
  const assetOnly = l === 0n;
  if (assetOnly) l = liquidityFrom(s, a, b, amount, !stockIs0);
  if (l <= 0n || l >= 2n ** 128n)
    throw Error("The range or amount produces invalid liquidity.");
  const [amount0, amount1] = amountsFor(s, a, b, l);
  return {
    amount0,
    amount1,
    min0: (amount0 * 995n) / 1000n,
    min1: (amount1 * 995n) / 1000n,
    liquidity: l,
    assetOnly,
  };
}
export function minimum(out: bigint, slippage: string) {
  if (
    !/^\d+(\.\d{1,2})?$/.test(slippage) ||
    Number(slippage) < 0.01 ||
    Number(slippage) > 50
  )
    throw Error("Set slippage between 0.01% and 50%.");
  return (out * (10000n - BigInt(Math.round(Number(slippage) * 100)))) / 10000n;
}
