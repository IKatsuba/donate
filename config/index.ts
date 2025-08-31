import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { http } from "viem";

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID!;

if (!projectId) {
  throw new Error("Project ID is not defined");
}

export const networks = [mainnet] as [AppKitNetwork, ...AppKitNetwork[]];

//Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  ssr: true,
  projectId,
  networks,
  transports: {
    [mainnet.id]: http(
      process.env.NODE_ENV !== "production"
        ? "http://127.0.0.1:8545"
        : mainnet.rpcUrls.default.http[0],
    ),
  },
});

export const config = wagmiAdapter.wagmiConfig;
