import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { approveIntent } from "@/lib/passkey";

/**
 * Two-step payment action: the server prepares the exact transaction and explains it, then the user approves
 * it with their passkey. OpenBounty's sponsor submits it and pays the network fee.
 */
export default function PasskeyAction({ label, prepare, onDone, compact = false, tone = "primary", disabled = false }) {
  const [intent, setIntent] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function start() {
    setBusy("prepare");
    setError("");
    setResult(null);
    try {
      const { intent: prepared } = await prepare();
      setIntent(prepared);
    } catch (prepareError) {
      setError(prepareError.message);
    } finally {
      setBusy("");
    }
  }

  async function approve() {
    setBusy("approve");
    setError("");
    try {
      const outcome = await approveIntent(intent);
      setIntent(null);
      setResult(outcome);
      onDone?.(outcome);
    } catch (approveError) {
      setError(approveError.message);
      if (!/cancelled|timed out/.test(approveError.message)) setIntent(null);
    } finally {
      setBusy("");
    }
  }

  const base = compact ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-xs";
  const colors = tone === "danger" ? "border border-rose-300 bg-white text-rose-800" : tone === "secondary" ? "border border-ob-line bg-white text-ob-navy" : "bg-ob-navy text-white";
  return (
    <div className="space-y-2">
      {!intent && (
        <button type="button" onClick={start} disabled={disabled || Boolean(busy)} className={`rounded-lg font-semibold disabled:opacity-50 ${base} ${colors}`}>
          {busy === "prepare" ? "Preparing…" : label}
        </button>
      )}
      {intent && (
        <div role="dialog" aria-label="Approve with passkey" className="rounded-lg border border-ob-line bg-[#f8fafc] p-3 text-xs">
          <p className="text-ob-navy">{intent.summary}</p>
          <p className="mt-1 text-ob-slate">{intent.mode === "sign" ? "This signs your consent; nothing is sent yet." : "Network fees are paid by OpenBounty. You need no gas token."}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" autoFocus onClick={approve} disabled={Boolean(busy)} aria-busy={busy === "approve"} className="inline-flex items-center gap-1 rounded-lg bg-ob-navy px-3 py-2 font-semibold text-white disabled:opacity-50">
              <Fingerprint className="size-4" /> {busy === "approve" ? "Confirm on your device…" : "Approve with passkey"}
            </button>
            <button type="button" onClick={() => setIntent(null)} disabled={Boolean(busy)} className="rounded-lg border border-ob-line px-3 py-2">Cancel</button>
          </div>
        </div>
      )}
      {result?.explorer && (
        <p role="status" className="text-[11px] text-emerald-800">Confirmed on chain. <a className="underline" href={result.explorer} target="_blank" rel="noreferrer">View receipt</a></p>
      )}
      {result?.status === "signed" && <p role="status" className="text-[11px] text-emerald-800">Signed.</p>}
      {error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}
