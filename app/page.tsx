"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  useAccount,
  useChainId,
  useChains,
  useSwitchChain,
  useSendTransaction,
  useConnect,
  useDisconnect,
} from "wagmi";
import { parseEther, isAddress } from "viem";
import { sepolia } from "wagmi/chains";

export default function DonatePage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const chains = useChains();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const {
    sendTransactionAsync,
    data: txHash,
    isPending: isSending,
  } = useSendTransaction();

  const [amount, setAmount] = useState("0.01");
  const [recipient, setRecipient] = useState(
    "0xbb61FFEF3c1855D40c5868669ac0ECeB47E4eF56",
  );
  const [selectedChainId, setSelectedChainId] = useState<number>(sepolia.id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chains?.length) return;
    if (!chains.find((c) => c.id === selectedChainId)) {
      setSelectedChainId(chains[0].id);
    }
  }, [chains, selectedChainId]);

  const isOnSelectedChain = useMemo(
    () => chainId === selectedChainId,
    [chainId, selectedChainId],
  );

  const txExplorerUrl = useMemo(() => {
    if (!txHash) return null;
    return `${sepolia.blockExplorers.default.url}/tx/${txHash}`;
  }, [txHash]);

  async function handleSend() {
    setError(null);
    if (!isConnected) {
      setError("Connect wallet");
      return;
    }
    if (!recipient || !isAddress(recipient)) {
      setError("Enter valid recipient address");
      return;
    }
    try {
      if (!isOnSelectedChain) {
        await switchChain({ chainId: selectedChainId });
      }
      const value = parseEther(amount as `${number}`);
      await sendTransactionAsync({
        chainId: selectedChainId,
        to: recipient as `0x${string}`,
        value,
      });
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "Error sending");
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Donate</CardTitle>
          <CardDescription>
            Send test ETH to the specified address in the selected network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm">
              <div className="font-medium">
                {isConnected ? "Connected:" : "Connect Wallet"}
              </div>
              <div className="text-muted-foreground break-all">
                {address || ""}
              </div>
            </div>
            {isConnected ? (
              <Button variant="secondary" onClick={() => disconnect()}>
                Disconnect Wallet
              </Button>
            ) : (
              <>
                {connectors.map((connector) => (
                  <Button
                    key={connector.id}
                    onClick={() =>
                      connect({ connector, chainId: selectedChainId })
                    }
                  >
                    {connector.icon && (
                      <img
                        src={connector.icon}
                        alt={connector.name}
                        className="w-4 h-4"
                      />
                    )}
                    {connector.name}
                  </Button>
                ))}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="network">Network</Label>
              <div className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground">
                  {sepolia.name}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (ETH)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient address</Label>
            <Input
              id="recipient"
              placeholder="0x... (your address)"
              value={recipient}
              readOnly
              onChange={(e) => setRecipient(e.target.value.trim())}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {txHash && (
            <div className="rounded-md border border-green-600/40 bg-green-600/10 p-2 text-sm break-all">
              <div>Hash: {txHash}</div>
              {txExplorerUrl && (
                <a
                  className="text-primary underline"
                  href={txExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in explorer
                </a>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={isSending || isSwitching}>
              {isSending ? "Sending..." : "Send donation"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
