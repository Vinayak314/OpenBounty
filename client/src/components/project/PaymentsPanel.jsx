import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Fingerprint, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatUnits6, shortAddress } from "@/lib/passkey";
import PasskeyAction from "@/components/project/PasskeyAction";

const wbt = (wei) => (wei ? (Number(BigInt(wei) / 10n ** 12n) / 1e6).toFixed(4) : "0");

// Payment account summary, sponsor health and on-chain payment permissions for the project.
export default function PaymentsPanel({ slug, refreshKey, onChanged }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [cap, setCap] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest(`/projects/${encodeURIComponent(slug)}/payments`)
      .then((result) => { if (active) { setOverview(result); setError(""); } })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [slug, refreshKey, tick]);

  const refresh = () => { setTick((value) => value + 1); onChanged?.(); };
  if (error) return <p role="alert" className="text-xs text-rose-700">{error}</p>;
  if (!overview) return <p role="status" className="text-xs text-ob-slate">Loading payment setup…</p>;
  const { config, account, sponsor, escrow, members } = overview;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-ob-line bg-white p-3 text-xs">
          <p className="flex items-center gap-1 font-semibold"><Fingerprint className="size-4" /> Your payment account</p>
          {account ? (
            <>
              <p className="mt-1 break-all font-mono text-[11px]">
                <a className="underline" href={`${config.explorerUrl}/address/${account.address}`} target="_blank" rel="noreferrer">{account.address}</a>
              </p>
              <p className="mt-1 text-ob-slate">{formatUnits6(account.usdtBalance)} USDT · {wbt(account.gasBalance)} WBT (none needed) · {account.deployed ? "active" : "activates on first use"}</p>
            </>
          ) : (
            <p className="mt-1 text-ob-slate">No payment account yet. <Link to="/connect" className="font-semibold underline">Create one with a passkey</Link> to fund or receive bounties.</p>
          )}
        </div>
        <div className="rounded-[12px] border border-ob-line bg-white p-3 text-xs">
          <p className="flex items-center gap-1 font-semibold"><ShieldCheck className="size-4" /> {config.networkName} · USDT</p>
          {!config.enabled ? <p className="mt-1 text-ob-slate">Payments are not configured on this server.</p> : (
            <>
              <p className="mt-1 text-ob-slate">
                Escrow <a className="underline" href={escrow.url} target="_blank" rel="noreferrer">{shortAddress(escrow.address)} <ExternalLink className="inline size-3" /></a>
              </p>
              <p className={`mt-1 ${sponsor?.healthy ? "text-emerald-700" : "text-amber-800"}`}>
                {sponsor?.configured ? (sponsor.healthy ? "Network fees are sponsored by OpenBounty." : "Gas sponsorship is paused (low balance or daily budget reached).") : "Gas sponsor not configured."}
              </p>
            </>
          )}
        </div>
      </div>

      {config.enabled && escrow && (
        <details className="rounded-[12px] border border-ob-line bg-white p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Payment permissions (on chain)</summary>
          <p className="mt-2 text-ob-slate">
            Escrow owner: <code>{shortAddress(escrow.owner)}</code>{escrow.ownerIsProjectOwner ? " (project owner)" : ""}. Only the owner grants roles.
            Maintainers can fund bounties and accept claims; payout approval also needs the settlement permission. Nobody, including the owner, can withdraw escrowed funds.
          </p>
          {escrow.canAcceptOwnership && (
            <div className="mt-2">
              <PasskeyAction label="Accept escrow ownership" prepare={() => apiRequest(`/projects/${encodeURIComponent(slug)}/payments/ownership/accept`, { method: "POST" })} onDone={refresh} />
            </div>
          )}
          <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[460px] text-left">
            <thead><tr className="text-ob-slate"><th className="py-1">Person</th><th>Account</th><th>Maintainer</th><th>Approve payouts</th></tr></thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.uid} className="border-t border-ob-line align-top">
                  <td className="py-2">{member.name}<br /><span className="text-ob-slate">{member.role}</span></td>
                  <td className="py-2 font-mono">{member.account ? shortAddress(member.account) : <span className="font-sans text-ob-slate">no account</span>}</td>
                  <td className="py-2">{member.isEscrowOwner ? "owner" : member.maintainer ? "yes" : "no"}</td>
                  <td className="py-2">{member.isEscrowOwner ? "owner" : member.settlement && member.maintainer ? "yes" : "no"}</td>
                  {escrow.canManageRoles && member.account && !member.isEscrowOwner && (
                    <td className="py-2">
                      <PasskeyAction compact
                        label={member.maintainer && member.settlement ? "Revoke" : "Grant both"}
                        prepare={() => apiRequest(`/projects/${encodeURIComponent(slug)}/payments/roles`, { method: "POST",
                          body: member.maintainer && member.settlement
                            ? { uid: member.uid, maintainer: false, settlement: false }
                            : { uid: member.uid, maintainer: true, settlement: true } })}
                        onDone={refresh} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {overview.autoPay?.available && (
            <div className="mt-3 rounded-lg border border-ob-line p-2">
              <p className="font-semibold">Automatic payouts</p>
              <p className="mt-1 text-ob-slate">
                {overview.autoPay.enabled
                  ? <>OpenBounty&rsquo;s payout agent <code>{shortAddress(overview.autoPay.agent)}</code> may release rewards of up to {overview.autoPay.capDisplay} USDT, only after a PR is merged and the 0G report recommends approval, and only to the claimant bound on chain. It cannot fund, refund or change roles.</>
                  : "Off. Maintainers approve every payout with their passkey."}
              </p>
              {escrow.canManageRoles && (
                <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(event) => event.preventDefault()}>
                  <label className="text-[11px] font-semibold">Limit per payout (USDT)
                    <input inputMode="decimal" value={cap} onChange={(event) => setCap(event.target.value)} placeholder="e.g. 100" className="mt-1 block w-28 rounded-lg border border-ob-line p-2 font-normal" />
                  </label>
                  <PasskeyAction compact label={overview.autoPay.enabled ? "Update limit" : "Enable"} disabled={!cap}
                    prepare={() => apiRequest(`/projects/${encodeURIComponent(slug)}/payments/autopay-agent`, { method: "POST", body: { maxUsdt: cap } })} onDone={refresh} />
                  {overview.autoPay.enabled && (
                    <PasskeyAction compact tone="secondary" label="Turn off"
                      prepare={() => apiRequest(`/projects/${encodeURIComponent(slug)}/payments/autopay-agent`, { method: "POST", body: { maxUsdt: null } })} onDone={refresh} />
                  )}
                </form>
              )}
            </div>
          )}
          {sponsor?.configured && (
            <p className="mt-3 text-[11px] text-ob-slate">
              Sponsor controls: allowlisted escrow/USDT calls only · {sponsor.limits.userTxPerHour}/user/hour, {sponsor.limits.userTxPerDay}/user/day,
              {" "}{sponsor.limits.globalTxPerHour}/hour overall{sponsor.dailyBudgetWei ? ` · ${wbt(sponsor.spentTodayWei)} of ${wbt(sponsor.dailyBudgetWei)} WBT budget used today.` : "."}
            </p>
          )}
        </details>
      )}
    </div>
  );
}
