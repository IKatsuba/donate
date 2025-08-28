"use client";

import { useMemo, useState } from "react";
import { sepolia } from "wagmi/chains";
import {
  useAccount,
  useBalance,
  useChainId,
  useDisconnect,
  useSwitchChain,
  useWriteContract,
  useReadContract,
} from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { parseEther, formatEther, isAddress, formatUnits } from "viem";
import { useAppKit } from "@reown/appkit/react";

type HexAddress = `0x${string}`;

const QUOTER_V2_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const SWAP_ROUTER_V3_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const SWAP_ROUTER_02: HexAddress = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
const QUOTER_V2: HexAddress = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3";

const WETH9_SEPOLIA: HexAddress = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

function tryParseNumber(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function SwapPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const { data: ethBalance } = useBalance({ address, chainId: sepolia.id });

  const [toToken, setToToken] = useState<string>("");
  const [fee, setFee] = useState<500 | 3000 | 10000>(3000);
  const [amountInEth, setAmountInEth] = useState<string>("0.005");
  const [error, setError] = useState<string | null>(null);
  const [txs, setTxs] = useState<{ hash: HexAddress }[]>([]);

  const isOnSepolia = chainId === sepolia.id;

  const toTokenAddress: HexAddress | null = useMemo(() => {
    return isAddress(toToken) ? (toToken as HexAddress) : null;
  }, [toToken]);

  const { data: toTokenSymbol } = useReadContract({
    abi: ERC20_ABI,
    address: toTokenAddress || undefined,
    functionName: "symbol",
    chainId: sepolia.id,
    query: { enabled: Boolean(toTokenAddress) },
  });

  const { data: toTokenDecimals } = useReadContract({
    abi: ERC20_ABI,
    address: toTokenAddress || undefined,
    functionName: "decimals",
    chainId: sepolia.id,
    query: { enabled: Boolean(toTokenAddress) },
  });

  const { data: toTokenBalance } = useReadContract({
    abi: ERC20_ABI,
    address: toTokenAddress || undefined,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sepolia.id,
    query: { enabled: Boolean(toTokenAddress && address) },
  });

  const {
    data: quote,
    isError: isQuoteError,
    error: quoteError,
  } = useReadContract({
    abi: QUOTER_V2_ABI,
    address: QUOTER_V2,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: WETH9_SEPOLIA,
        tokenOut: toTokenAddress,
        fee,
        amountIn: parseEther(
          String(tryParseNumber(amountInEth)) as `${number}`,
        ),
        sqrtPriceLimitX96: 0n,
      },
    ],
    chainId: sepolia.id,
    query: { enabled: Boolean(toTokenAddress && amountInEth) },
  });

  const formattedQuote = useMemo(() => {
    try {
      if (!quote) return null;
      const amountOutRaw = Array.isArray(quote)
        ? (quote[0] as unknown as bigint)
        : (quote as unknown as bigint);
      const dec = Number(toTokenDecimals || 18);
      const num = Number(formatUnits(amountOutRaw, dec));
      if (!Number.isFinite(num)) return null;
      return num;
    } catch {
      return null;
    }
  }, [quote, toTokenDecimals]);

  const txExplorerBase = sepolia.blockExplorers.default.url;

  async function ensureSepolia() {
    if (!isOnSepolia) {
      await switchChain({ chainId: sepolia.id });
    }
  }

  async function handleSwap() {
    try {
      setError(null);
      if (!isConnected) {
        throw new Error("Connect wallet");
      }
      if (!toTokenAddress) {
        throw new Error("Enter a valid destination token address");
      }

      const amountNum = tryParseNumber(amountInEth);
      if (amountNum === null || amountNum === 0) {
        throw new Error("Enter amount");
      }

      await ensureSepolia();

      const amountInWei = parseEther(String(amountNum) as `${number}`);

      const hash = await writeContractAsync({
        abi: SWAP_ROUTER_V3_ABI,
        address: SWAP_ROUTER_02,
        functionName: "exactInputSingle",
        chainId: sepolia.id,
        args: [
          {
            tokenIn: WETH9_SEPOLIA,
            tokenOut: toTokenAddress,
            fee,
            recipient: address as HexAddress,
            amountIn: amountInWei,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
        value: amountInWei,
      });

      setTxs((prev) => [{ hash: hash as HexAddress }, ...prev]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Swap error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Swap (Sepolia)</CardTitle>

          <CardDescription>
            Swap Sepolia ETH to a selected ERC-20 via Uniswap V3 (WETH → Token).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm">
              <div className="font-medium">
                {isConnected ? "Wallet" : "Connect wallet"}
              </div>
              <div className="text-muted-foreground break-all">
                {address || ""}
              </div>
              <div className="text-muted-foreground text-xs">
                Network:{" "}
                {isOnSepolia ? sepolia.name : `Not Sepolia (${chainId})`}
              </div>
            </div>
            {isConnected ? (
              <Button variant="secondary" onClick={() => disconnect()}>
                Disconnect
              </Button>
            ) : (
              <>
                <Button onClick={() => open()}>Connect Wallet</Button>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Pay (ETH)</Label>
              <Input
                inputMode="decimal"
                value={amountInEth}
                onChange={(e) => setAmountInEth(e.target.value)}
              />
              <div className="text-xs text-muted-foreground">
                Balance:{" "}
                {ethBalance
                  ? `${Number(formatEther(ethBalance.value)).toFixed(6)} ETH`
                  : "—"}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Receive (token address)</Label>
              <Input
                placeholder="0x... (e.g., USDC on Sepolia)"
                value={toToken}
                onChange={(e) => setToToken(e.target.value.trim())}
              />
              <div className="text-xs text-muted-foreground">
                {toTokenAddress
                  ? `Token: ${toTokenSymbol || "?"}`
                  : "Enter a valid ERC-20 address"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Pool fee (fee)</Label>
              <select
                className={cn(
                  "h-9 w-full rounded-md border bg-background px-3 text-sm",
                )}
                value={fee}
                onChange={(e) =>
                  setFee(Number(e.target.value) as 500 | 3000 | 10000)
                }
              >
                <option value={500}>0.05% (500)</option>
                <option value={3000}>0.3% (3000)</option>
                <option value={10000}>1% (10000)</option>
              </select>
            </div>
          </div>

          {formattedQuote !== null && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              Quote: {amountInEth} ETH → ~
              {formattedQuote.toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}{" "}
              {toTokenSymbol || "TOKEN"}
            </div>
          )}

          {toTokenAddress && (
            <div className="text-xs text-muted-foreground">
              Balance {toTokenSymbol || "TOKEN"}:{" "}
              {toTokenBalance
                ? (() => {
                    const dec = Number(toTokenDecimals || 18);

                    return `${Number(formatUnits(toTokenBalance as unknown as bigint, dec)).toFixed(6)}`;
                  })()
                : "—"}
            </div>
          )}

          {isQuoteError && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
              {quoteError.shortMessage}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleSwap}
              disabled={!toTokenAddress || isWriting || isSwitching}
            >
              {isWriting ? "Swapping..." : "Swap"}
            </Button>
          </div>

          {txs.length > 0 && (
            <div className="space-y-2">
              <Label>Transactions</Label>
              <div className="space-y-2 text-sm">
                {txs.map((t, i) => (
                  <div
                    key={t.hash + String(i)}
                    className="rounded-md border p-2 break-all"
                  >
                    <div>Hash: {t.hash}</div>
                    <a
                      className="text-primary underline"
                      href={`${txExplorerBase}/tx/${t.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in explorer
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
