import { Link } from "react-router-dom";
import walletIcon from "@/assets/wallet/wallet.svg";
import walletWhite from "@/assets/wallet/wallet-white.svg";
import circleCheck from "@/assets/wallet/circle-check.svg";
import shieldCheck from "@/assets/wallet/shield-check.svg";

const usdt = (value) => {
  if (value === null || value === undefined) return "–";
  const big = BigInt(value);
  const fraction = (big % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${big / 1000000n}${fraction ? `.${fraction}` : ""}`;
};

export default function ConnectWalletCard({ account, intro, wallet, walletLoading, walletBusy, walletError, onConnectWallet, onDisconnectWallet, trustNote, nextStep, config }) {
  return (
    <section className="flex w-[530px] flex-col items-center gap-4 overflow-hidden rounded-[12px] border border-ob-line bg-white p-7">
      <div className="flex size-12 items-center justify-center rounded-full bg-[#f8fafc]">
        <img src={walletIcon} alt="" className="size-6" />
      </div>

      <div className="flex w-full flex-col gap-3 text-center">
        <h1 className="font-serif text-[28px] font-normal leading-[1.18] text-ob-navy">
          {intro.headline}
          <br />
          <span className="text-ob-slate">{intro.headlineMuted}</span>
        </h1>
        <p className="text-[13px] leading-[1.7] text-ob-slate">{intro.description}</p>
      </div>

      <div className="flex w-full items-center gap-[10px] overflow-hidden rounded-[10px] border border-ob-line bg-white p-[10px]">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ob-navy text-[10.24px] font-semibold text-white">
          {account.initials}
        </span>
        <div className="flex min-w-px flex-1 flex-col gap-1 leading-[normal]">
          <span className="text-[12px] font-semibold text-ob-navy">{account.handle}</span>
          <span className="text-[10px] text-ob-slate">
            {account.provider} {account.status}
          </span>
        </div>
        <img src={circleCheck} alt="" className="size-5 shrink-0" />
      </div>

      {wallet ? (
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-center gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] font-semibold text-emerald-900">
            <img src={circleCheck} alt="" className="size-4" />
            Payment account ready · {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-ob-slate">
            <span className="rounded-[8px] bg-[#f8fafc] p-2">USDT balance<br /><strong className="text-ob-navy">{usdt(wallet.usdtBalance)}</strong></span>
            <span className="rounded-[8px] bg-[#f8fafc] p-2">Network fees<br /><strong className="text-ob-navy">Paid by OpenBounty</strong></span>
          </div>
          <p className="break-all text-center text-[10px] text-ob-slate">
            To fund bounties, send test USDT on {config?.networkName || "Whitechain Sepolia"} to{" "}
            <a className="underline" href={`${config?.explorerUrl}/address/${wallet.address}`} target="_blank" rel="noreferrer">{wallet.address}</a>.
            {!wallet.deployed && " Your account activates with its first sponsored transaction."}
          </p>
          <button type="button" onClick={onDisconnectWallet} disabled={walletBusy} className="self-center text-[11px] text-ob-slate underline disabled:opacity-60">
            Remove this payment account
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConnectWallet}
          disabled={walletLoading || walletBusy || config?.accountsEnabled === false}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-ob-navy bg-ob-navy px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          <img src={walletWhite} alt="" className="size-[18px]" />
          {walletLoading ? "Loading…" : walletBusy ? "Follow your device's passkey prompt…" : "Create payment account with a passkey"}
        </button>
      )}
      {config?.accountsEnabled === false && !wallet && <p className="w-full text-center text-xs text-ob-slate">Payment accounts are not configured on this server yet.</p>}
      {walletError && <p role="alert" className="w-full text-center text-xs text-red-700">{walletError}</p>}

      <div className="flex w-full items-start gap-2 rounded-[10px] bg-[#f8fafc] p-[10px]">
        <img src={shieldCheck} alt="" className="size-[18px] shrink-0" />
        <p className="min-w-px flex-1 text-[10px] leading-[1.7] text-ob-slate">{trustNote}</p>
      </div>

      <div className="h-px w-full bg-ob-line opacity-40" />
      <Link to={nextStep.href} className="text-[11px] text-ob-slate">
        {nextStep.label}
      </Link>
    </section>
  );
}
