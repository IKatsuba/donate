"use client";

import { useMemo, useState } from "react";
import { mainnet } from "wagmi/chains";
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useDisconnect,
  useWriteContract,
  useReadContract,
} from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { parseEther, formatEther, isAddress, formatUnits } from "viem";
import {
  Shield,
  Wallet,
  ArrowRight,
  Copy,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";

const WETH_MAINNET = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as const;
const SWAP_ROUTER_02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as const;

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

// no ERC-20 ABI needed for simple swap route

export default function CryptoTransfer() {
  const { address, isConnected } = useAccount();
  const { data: ethBalance } = useBalance({ address, chainId: mainnet.id });
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const { theme, setTheme } = useTheme();

  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const TOKENS = {
    ETH: { type: "native" as const, symbol: "ETH", decimals: 18 },
    USDT: {
      type: "erc20" as const,
      symbol: "USDT",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
    },
    USDC: {
      type: "erc20" as const,
      symbol: "USDC",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
    },
  };
  const [selectedToken, setSelectedToken] =
    useState<keyof typeof TOKENS>("USDT");
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLoading = isPending || isWritePending;

  const POOL_FEE: 500 | 3000 | 10000 = 3000;

  const { data: quoteOut } = useReadContract({
    abi: QUOTER_V2_ABI,
    address: QUOTER_V2,
    functionName: "quoteExactInputSingle",
    args:
      selectedToken === "ETH" || !amount
        ? undefined
        : [
            {
              tokenIn: WETH_MAINNET,
              tokenOut: TOKENS[selectedToken].address,
              fee: POOL_FEE,
              amountIn: (() => {
                try {
                  return parseEther(String(Number(amount)) as `${number}`);
                } catch {
                  return 0n;
                }
              })(),
              sqrtPriceLimitX96: 0n,
            },
          ],
    query: { enabled: Boolean(selectedToken !== "ETH" && Number(amount) > 0) },
  });

  const estimatedOut = useMemo(() => {
    try {
      if (!quoteOut || selectedToken === "ETH") return null;
      const raw = Array.isArray(quoteOut)
        ? (quoteOut[0] as unknown as bigint)
        : (quoteOut as unknown as bigint);
      const num = Number(formatUnits(raw, TOKENS[selectedToken].decimals));
      return Number.isFinite(num) ? num : null;
    } catch {
      return null;
    }
  }, [quoteOut, selectedToken]);

  async function handleSend() {
    if (!isConnected) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!recipientAddress || !amount || !confirmed) {
      toast.error("Fill all fields and confirm the transfer");
      return;
    }
    if (!isAddress(recipientAddress)) {
      toast.error("Invalid recipient address");
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    try {
      if (selectedToken === "ETH") {
        const hash = await sendTransactionAsync({
          to: recipientAddress as `0x${string}`,
          value: parseEther(String(amountNum) as `${number}`),
        });

        toast.success("Transaction sent", {
          description: `${amount} ETH to ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`,
          action: {
            label: "View",
            onClick: () => {
              const url = `${mainnet.blockExplorers.default.url}/tx/${hash}`;
              window.open(url, "_blank");
            },
          },
        });
      } else {
        const meta = TOKENS[selectedToken];
        const amountInWei = parseEther(String(amountNum) as `${number}`);
        const hash = await writeContractAsync({
          abi: SWAP_ROUTER_V3_ABI,
          address: SWAP_ROUTER_02,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: WETH_MAINNET as `0x${string}`,
              tokenOut: meta.address as `0x${string}`,
              fee: POOL_FEE,
              recipient: recipientAddress as `0x${string}`,
              amountIn: amountInWei,
              amountOutMinimum: 0n,
              sqrtPriceLimitX96: 0n,
            },
          ],
          value: amountInWei,
        });

        toast.success("Transaction sent", {
          description: `${amount} ETH swapped to ${meta.symbol} and sent to ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`,
          action: {
            label: "View",
            onClick: () => {
              const url = `${mainnet.blockExplorers.default.url}/tx/${hash}`;
              window.open(url, "_blank");
            },
          },
        });
      }

      setRecipientAddress("");
      setAmount("");
      setConfirmed(false);
    } catch (err) {
      toast.error("Failed to send transaction");
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <div className="min-h-screen bg-background aurora flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
          className="fixed right-4 top-4 z-50 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-background/60 backdrop-blur-md hover:bg-background/80 transition"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-2">
            <Wallet className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">
              Crypto Transfer
            </h1>
          </div>
          <p className="text-muted-foreground">Send crypto safely and fast</p>
        </div>

        <div className="rounded-lg glass p-3 flex items-center gap-3">
          <div className="flex-1 text-sm">
            <div className="font-medium">
              {isConnected ? "Wallet" : "Connect wallet"}
            </div>
            <div className="text-muted-foreground break-all">
              {address || ""}
            </div>
            <div className="text-muted-foreground text-xs">
              Network: {mainnet.name}
            </div>
          </div>
          {isConnected ? (
            <Button variant="secondary" onClick={() => disconnect()}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={() => open()}>Connect</Button>
          )}
        </div>

        <Card className="glass shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl flex items-center space-x-2">
              <Shield className="h-5 w-5 text-primary" />
              <span>New transfer</span>
            </CardTitle>
            <CardDescription>Enter recipient and amount</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium">
                Token
              </Label>
              <Select
                value={selectedToken}
                onValueChange={(v) =>
                  setSelectedToken(v as keyof typeof TOKENS)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ETH">ETH (Native)</SelectItem>
                  <SelectItem value="USDT">USDT (Tether)</SelectItem>
                  <SelectItem value="USDC">USDC (Circle)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="recipient"
                className="text-sm font-medium flex items-center space-x-1"
              >
                <span>Recipient address</span>
                <Shield className="h-3 w-3 text-muted-foreground" />
              </Label>
              <div className="relative">
                <Input
                  id="recipient"
                  placeholder="0x1234...abcd"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className="pr-10"
                />
                {recipientAddress && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-8 w-8 p-0"
                    onClick={() => copyToClipboard(recipientAddress)}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium">
                Amount (ETH)
              </Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pr-16"
                  step="0.001"
                  min="0"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                  ETH
                </div>
              </div>
              {selectedToken !== "ETH" && estimatedOut !== null && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  Est. receive: ~
                  {estimatedOut.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}{" "}
                  {TOKENS[selectedToken].symbol}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Balance:{" "}
                {ethBalance
                  ? `${Number(formatEther(ethBalance.value)).toFixed(6)} ETH`
                  : "—"}
              </div>
            </div>

            <div className="flex items-center space-x-2 p-4 bg-muted/50 rounded-lg">
              <Checkbox
                id="confirm"
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(Boolean(v))}
              />
              <Label
                htmlFor="confirm"
                className="text-sm leading-relaxed cursor-pointer"
              >
                I confirm I verified the recipient and amount
              </Label>
            </div>

            <div className="flex space-x-3">
              <Button
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => {
                  setRecipientAddress("");
                  setAmount("");
                  setConfirmed(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSend}
                disabled={
                  !recipientAddress || !amount || !confirmed || isLoading
                }
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    <span>Sending...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span>Send</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p className="flex items-center justify-center space-x-1">
            <Shield className="h-3 w-3" />
            <span>All transactions are protected by cryptography</span>
          </p>
          <p>Double-check the address before sending</p>
        </div>
      </div>
    </div>
  );
}
