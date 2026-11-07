import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ExternalLink, Wallet } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatUnits6 } from "@/lib/passkey";
import { cn } from "@/lib/utils";

export const WALLET_CHANGED = "ob:wallet-changed";
const POLL_MS = 30000;

// Two decimals for display; the popover shows the exact amount.
function shortUsdt(value) {
  if (value === null || value === undefined) return "–";
  const big = BigInt(value);
  const cents = big / 10000n;
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** The signed-in user's payment account and USDT balance, refreshed every 30 s, on focus and after payments. */
function useWallet() {
  const [state, setState] = useState({ loading: true, config: null, account: null, error: "" });
  const load = useCallback(async () => {
    try {
      const result = await apiRequest("/wallet");
      setState({ loading: false, config: result.config, account: result.account, error: "" });
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: error.message }));
    }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && load();
    window.addEventListener(WALLET_CHANGED, load);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener(WALLET_CHANGED, load);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);
  return { ...state, reload: load };
}

/**
 * Small navbar element: the USDT balance of the user's passkey payment account. Opens a panel with the account
 * address, a copy button and explorer links, so the account and its transactions can be found on Whitechain.
 */
export default function WalletBalanceChip({ className = "" }) {
  const { loading, config, account, error, reload } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (event) => !ref.current?.contains(event.target) && setOpen(false);
    const esc = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const chip = "flex items-center gap-1.5 rounded-full border border-ob-line bg-white px-[10px] py-[5px] text-[11px] font-semibold leading-[normal] text-ob-navy transition-colors hover:bg-ob-mist";
  if (config && !config.accountsEnabled) return null;
  if (loading) return <span className={cn(chip, "text-ob-slate", className)} aria-busy="true"><Wallet className="size-3.5" strokeWidth={1.8} />USDT …</span>;
  if (!account) {
    return (
      <Link to="/connect" className={cn(chip, className)} title={error || "Create a payment account with a passkey"}>
        <Wallet className="size-3.5" strokeWidth={1.8} />{error ? "Wallet unavailable" : "Set up wallet"}
      </Link>
    );
  }

  const explorer = config?.explorerUrl || "";
  const addressUrl = `${explorer}/address/${account.address}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(account.address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the address is selectable */ }
  };

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button type="button" className={chip} aria-expanded={open} aria-label={`USDT balance ${formatUnits6(account.usdtBalance)}. Open payment account details`}
        onClick={() => { setOpen((value) => !value); if (!open) reload(); }}>
        <Wallet className="size-3.5" strokeWidth={1.8} />
        <span>{shortUsdt(account.usdtBalance)}</span>
        <span className="font-medium text-ob-slate">USDT</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Payment account" className="fixed inset-x-3 top-[68px] z-40 max-h-[calc(100dvh-84px)] animate-[pop_.15s_ease-out] overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white p-3 text-[11px] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[320px]">
          <p className="text-xs font-semibold text-ob-navy">Your payment account</p>
          <p className="mt-1 text-ob-slate">{config?.networkName || "Whitechain Sepolia"} (test network) · passkey smart account, no wallet app</p>
          <p className="mt-2 text-2xl font-semibold text-ob-navy">{formatUnits6(account.usdtBalance)} <span className="text-xs font-medium text-ob-slate">USDT</span></p>
          <p className="text-ob-slate">Balance in this account. Rewards locked in a funded bounty sit in the escrow contract until they are paid out or refunded.</p>
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-[#f8fafc] p-2">
            <code className="min-w-0 flex-1 break-all text-[10px] text-ob-navy">{account.address}</code>
            <button type="button" onClick={copy} aria-label="Copy address" className="shrink-0 rounded p-1 hover:bg-ob-mist">{copied ? <Check className="size-3.5 text-emerald-700" /> : <Copy className="size-3.5" />}</button>
          </div>
          <p className="mt-2 text-ob-slate">
            {account.deployed
              ? "Active on chain."
              : "Not on chain yet: the explorer shows an empty address until its first sponsored transaction activates it. Funds sent to this address are safe and appear once it is active."}
          </p>
          <ul className="mt-2 space-y-1">
            <li><a className="inline-flex items-center gap-1 underline" href={addressUrl} target="_blank" rel="noreferrer">Transactions and balances on the explorer <ExternalLink className="size-3" /></a></li>
            <li><a className="inline-flex items-center gap-1 underline" href={`${addressUrl}?tab=token_transfers`} target="_blank" rel="noreferrer">USDT transfers <ExternalLink className="size-3" /></a></li>
            {config?.escrow && <li><a className="inline-flex items-center gap-1 underline" href={`${explorer}/address/${config.escrow}`} target="_blank" rel="noreferrer">Escrow contract <ExternalLink className="size-3" /></a></li>}
          </ul>
          <p className="mt-2 text-[10px] text-ob-slate">Gas is paid by OpenBounty in WBT, so this account never needs it. Only the designated test USDT counts: {config?.token ? <a className="underline" href={`${explorer}/token/${config.token}`} target="_blank" rel="noreferrer">{config.token.slice(0, 8)}…{config.token.slice(-4)}</a> : "see the README"}.</p>
          <Link to="/connect" onClick={() => setOpen(false)} className="mt-2 block text-ob-slate underline">Wallet page</Link>
        </div>
      )}
    </div>
  );
}
