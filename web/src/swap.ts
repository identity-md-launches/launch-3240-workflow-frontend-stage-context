import { encodeAbiParameters, parseAbiParameters, type Address } from "viem";
import { protocol, type Config } from "./config";
import { minimum } from "./math";
export function swapCall(
  c: Config,
  input: Address,
  amount: bigint,
  out: bigint,
  slippage: string,
  now: bigint,
) {
  const pool = c.deployment.poolKey;
  const zeroForOne = input.toLowerCase() === pool.currency0.toLowerCase();
  if (!zeroForOne && input.toLowerCase() !== pool.currency1.toLowerCase())
    throw Error("Input is outside the attested pool.");
  const output = zeroForOne ? pool.currency1 : pool.currency0;
  const min = minimum(out, slippage);
  const extended = c.deployment.network.uniswapV4.extendedSwapParams;
  const tuple = `((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? "uint256 reserved," : ""}bytes hookData)`;
  const params = [
    encodeAbiParameters(parseAbiParameters(tuple), [
      extended
        ? [pool, zeroForOne, amount, min, 0n, "0x"]
        : [pool, zeroForOne, amount, min, "0x"],
    ] as any),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [input, amount]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [output, min]),
  ];
  return {
    address: c.deployment.network.uniswapV4.universalRouter,
    abi: protocol.router,
    functionName: "execute",
    args: [
      "0x10",
      [
        encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
          "0x060c0f",
          params,
        ]),
      ],
      now + 1200n,
    ],
    value: BigInt(input) === 0n ? amount : 0n,
  };
}
