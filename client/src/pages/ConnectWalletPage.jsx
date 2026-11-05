import folkPattern from "@/assets/wallet/folk-pattern.jpg";
import OnboardingHeader from "@/components/wallet/OnboardingHeader";
import JourneyProgress from "@/components/wallet/JourneyProgress";
import ConnectWalletCard from "@/components/wallet/ConnectWalletCard";
import { WALLET_SESSION, WALLET_OPTIONS } from "@/data/wallet";

export default function ConnectWalletPage() {
  const s = WALLET_SESSION;
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
          <JourneyProgress steps={s.steps} />
          <ConnectWalletCard
            account={s.account}
            intro={s.intro}
            wallets={WALLET_OPTIONS}
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
