import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import folkPattern from "@/assets/wallet/folk-pattern.jpg";
import OnboardingHeader from "@/components/wallet/OnboardingHeader";
import JourneyProgress from "@/components/wallet/JourneyProgress";
import ConnectWalletCard from "@/components/wallet/ConnectWalletCard";
import { WALLET_SESSION } from "@/data/wallet";
import { useAuth } from "@/auth/AuthContext";
import { apiRequest } from "@/lib/api";
import { createPaymentAccount, passkeysSupported } from "@/lib/passkey";

export default function ConnectWalletPage() {
  const navigate = useNavigate();
  const { name, handle, initials } = useAuth();
  const s = WALLET_SESSION;
  const account = { ...s.account, name, handle, initials };
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState("");

  const [config, setConfig] = useState(null);

  useEffect(() => {
    let active = true;
    apiRequest("/wallet")
      .then((result) => {
        if (!active) return;
        setConfig(result.config);
        setWallet(result.account);
      })
      .catch((error) => { if (active) setWalletError(error.message); })
      .finally(() => { if (active) setWalletLoading(false); });
    return () => { active = false; };
  }, []);

  async function connectWallet() {
    setWalletError("");
    setWalletBusy(true);
    try {
      if (!config?.accountsEnabled) throw new Error("Payment accounts are not configured on this server yet.");
      if (!passkeysSupported()) throw new Error("This browser does not support passkeys. Use a current Chrome, Safari, Edge or Firefox.");
      const result = await createPaymentAccount();
      setWallet(result.account);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setWalletError(error.message || "Could not create your payment account. Please try again.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function disconnectWallet() {
    const ok = window.confirm("Remove this payment account from OpenBounty? A passkey account cannot be recovered or re-linked, and anything it holds stays inaccessible. Accounts with a balance or escrow permissions cannot be removed.");
    if (!ok) return;
    setWalletError("");
    setWalletBusy(true);
    try {
      await apiRequest("/me/wallet", { method: "DELETE", body: { confirm: true } });
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
        <main className="flex flex-col items-center gap-6 pt-8 sm:pt-12 md:pt-[72px]">
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
            config={config}
            trustNote={s.trustNote}
            nextStep={s.nextStep}
          />
          <p className="text-[10px] text-ob-slate opacity-60">{s.network}</p>
        </main>
        <footer className="mt-auto pb-[31px] text-center">
          <p className="whitespace-pre-line px-4 text-[10px] text-ob-slate opacity-60">{s.footer}</p>
        </footer>
      </div>
    </div>
  );
}
