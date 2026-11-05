import { useEffect, useState } from "react";
import folkPattern from "@/assets/wallet/folk-pattern.jpg";
import OnboardingHeader from "@/components/wallet/OnboardingHeader";
import JourneyProgress from "@/components/wallet/JourneyProgress";
import ConnectWalletCard from "@/components/wallet/ConnectWalletCard";
import { WALLET_SESSION } from "@/data/wallet";
import { useAuth } from "@/auth/AuthContext";
import { apiRequest } from "@/lib/api";

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_HEX = "0x2105";

async function switchToBase(ethereum) {
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_HEX }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: BASE_CHAIN_HEX,
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://mainnet.base.org"],
        blockExplorerUrls: ["https://basescan.org"],
      }],
    });
  }
}

export default function ConnectWalletPage() {
  const { name, handle, initials } = useAuth();
  const s = WALLET_SESSION;
  const account = { ...s.account, name, handle, initials };
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/me")
      .then(({ user }) => { if (active) setWallet(user.wallet); })
      .catch((error) => { if (active) setWalletError(error.message); })
      .finally(() => { if (active) setWalletLoading(false); });
    return () => { active = false; };
  }, []);

  async function connectWallet() {
    setWalletError("");
    setWalletBusy(true);
    try {
      const ethereum = window.ethereum;
      if (!ethereum) throw new Error("MetaMask was not found. Install the MetaMask browser extension, then try again.");
      if (!ethereum.isMetaMask) throw new Error("Use MetaMask to connect your payout wallet.");

      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0];
      if (!address) throw new Error("MetaMask did not return an account.");

      await switchToBase(ethereum);
      const chainId = Number.parseInt(await ethereum.request({ method: "eth_chainId" }), 16);
      if (chainId !== BASE_CHAIN_ID) throw new Error("Switch MetaMask to the Base network to continue.");

      const { message } = await apiRequest("/me/wallet/challenge", {
        method: "POST",
        body: { address, chainId },
      });
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });
      const result = await apiRequest("/me/wallet/verify", {
        method: "POST",
        body: { address, chainId, signature },
      });
      setWallet(result.wallet);
    } catch (error) {
      if (error.code === 4001) setWalletError("Connection was cancelled in MetaMask.");
      else setWalletError(error.message || "Could not connect MetaMask. Please try again.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function disconnectWallet() {
    setWalletError("");
    setWalletBusy(true);
    try {
      await apiRequest("/me/wallet", { method: "DELETE" });
      setWallet(null);
    } catch (error) {
      setWalletError(error.message);
    } finally {
      setWalletBusy(false);
    }
  }

  const steps = wallet
    ? s.steps.map((step) => step.id === "dashboard" ? { ...step, status: "current" } : { ...step, status: "complete" })
    : s.steps;

  return (
    <div className="relative flex min-h-screen flex-col bg-white font-sans leading-[normal] text-ob-navy">
      <img
        src={folkPattern}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.02]"
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        <OnboardingHeader helpLink={s.helpLink} />
        <main className="flex flex-col items-center gap-6 pt-[72px]">
          <JourneyProgress steps={steps} />
          <ConnectWalletCard
            account={account}
            intro={s.intro}
            wallet={wallet}
            walletLoading={walletLoading}
            walletBusy={walletBusy}
            walletError={walletError}
            onConnectWallet={connectWallet}
            onDisconnectWallet={disconnectWallet}
            trustNote={s.trustNote}
            nextStep={s.nextStep}
          />
          <p className="text-[10px] text-ob-slate opacity-60">{s.network}</p>
        </main>
        <footer className="mt-auto pb-[31px] text-center">
          <p className="whitespace-pre text-[10px] text-ob-slate opacity-60">{s.footer}</p>
        </footer>
      </div>
    </div>
  );
}
