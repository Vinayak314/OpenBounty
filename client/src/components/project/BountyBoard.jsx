import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { shortAddress } from "@/lib/passkey";
import EvidenceReport from "@/components/project/EvidenceReport";
import PasskeyAction from "@/components/project/PasskeyAction";
import PaymentsPanel from "@/components/project/PaymentsPanel";

const STATUS = {
  draft: ["Draft", "bg-ob-mist text-ob-navy"],
  funding: ["Awaiting funding signature", "bg-amber-100 text-amber-900"],
  funded: ["Funded · open", "bg-emerald-100 text-emerald-800"],
  claimed: ["Claimed", "bg-sky-100 text-sky-900"],
  submitted: ["Submitted · in review", "bg-violet-100 text-violet-900"],
  paid: ["Paid", "bg-emerald-600 text-white"],
  refunded: ["Refunded", "bg-ob-line text-ob-slate"],
};

const isoDate = (date) => new Date(date).toLocaleString();
// <input type="datetime-local"> holds LOCAL time. Converting through toISOString() shifted it by the timezone
// offset on every save, so format and parse it in local time instead.
const pad = (value) => String(value).padStart(2, "0");
const toLocalInput = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultDeadline = () => toLocalInput(Date.now() + 7 * 86400000);

export default function BountyBoard({ slug, canMaintain }) {
  const base = `/projects/${encodeURIComponent(slug)}/bounties`;
  const [bounties, setBounties] = useState([]);
  const [limitation, setLimitation] = useState("");
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const run = () => apiRequest(base, { signal: controller.signal })
      .then((result) => {
        setBounties(result.bounties);
        setLimitation(result.limitation);
        setError("");
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); });
    run();
    const timer = setInterval(run, 8000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [base, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);
  const selected = bounties.find((bounty) => bounty.number === open);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" aria-label="Bounty board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl">Bounties</h2>
          <p className="text-xs text-ob-slate">Funded tasks paid in USDT on Whitechain. Approve each payment with your passkey; OpenBounty pays the network fees.</p>
        </div>
        {canMaintain && !creating && (
          <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-ob-navy px-3 py-2 text-xs font-semibold text-white">New bounty</button>
        )}
      </div>

      <div className="mt-4"><PaymentsPanel slug={slug} refreshKey={refreshKey} onChanged={refresh} /></div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {creating && <BountyForm slug={slug} base={base} onClose={() => setCreating(false)} onSaved={(bounty) => { setCreating(false); setOpen(bounty.number); refresh(); }} />}

      <ul className="mt-4 space-y-2">
        {bounties.length === 0 && !creating && <li className="text-sm text-ob-slate">No bounties yet.{canMaintain ? " Create one from an issue to get started." : ""}</li>}
        {bounties.map((bounty) => {
          const [label, tone] = STATUS[bounty.status] || [bounty.status, "bg-ob-mist"];
          return (
            <li key={bounty.id} className="rounded-[12px] border border-ob-line bg-white">
              <button type="button" onClick={() => setOpen(open === bounty.number ? null : bounty.number)} aria-expanded={open === bounty.number}
                className="flex w-full flex-wrap items-center gap-3 p-3 text-left">
                <span className="font-mono text-xs text-ob-slate">#{bounty.number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{bounty.title}</span>
                <span className="text-sm font-semibold">{bounty.amountDisplay} USDT</span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${tone}`}>{label}</span>
              </button>
              {open === bounty.number && selected && (
                <BountyDetail base={base} slug={slug} summary={selected} limitation={limitation} onChanged={refresh} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BountyForm({ slug, base, onClose, onSaved, initial }) {
  const [form, setForm] = useState(initial || { title: "", description: "", issueNumber: "", amount: "", submissionDeadline: defaultDeadline(), criteria: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [draftInfo, setDraftInfo] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const [issues, setIssues] = useState([]);
  const [issuesNote, setIssuesNote] = useState("");

  // Open issues of the project's repository. If GitHub is unreachable the typed number still works.
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`${base}/issues`, { signal: controller.signal })
      .then((data) => setIssues(data.issues || []))
      .catch((loadError) => { if (loadError.name !== "AbortError") setIssuesNote("Could not load issues. Type the issue number instead."); });
    return () => controller.abort();
  }, [base]);

  function pickIssue(event) {
    const issue = issues.find((item) => String(item.number) === event.target.value);
    setForm((current) => ({
      ...current,
      issueNumber: issue ? String(issue.number) : "",
      title: current.title || issue?.title || "",
    }));
  }

  async function draftWith0g() {
    setBusy("draft");
    setError("");
    try {
      const { draft } = await apiRequest(`/projects/${encodeURIComponent(slug)}/criteria/draft`, {
        method: "POST", body: { task: [form.title, form.description].filter(Boolean).join("\n"), issueNumber: form.issueNumber ? Number(form.issueNumber) : null },
      });
      setForm((current) => ({ ...current, criteria: draft.items.join("\n") }));
      setDraftInfo(`Drafted by 0G (request ${draft.requestId}). Edit before saving.`);
    } catch (draftError) {
      setError(draftError.message);
    } finally {
      setBusy("");
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    try {
      const body = {
        title: form.title, description: form.description, amount: form.amount,
        issueNumber: form.issueNumber ? Number(form.issueNumber) : null,
        submissionDeadline: new Date(form.submissionDeadline).toISOString(), // parsed as local time, sent as UTC
        criteria: form.criteria.split("\n").map((line) => line.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s*/, "").trim()).filter(Boolean),
      };
      const { bounty } = initial?.number
        ? await apiRequest(`${base}/${initial.number}`, { method: "PATCH", body })
        : await apiRequest(base, { method: "POST", body });
      onSaved(bounty);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy("");
    }
  }

  const field = "mt-1 w-full rounded-lg border border-ob-line bg-white p-2 text-sm font-normal";
  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-[14px] border border-ob-line bg-[#f8fafc] p-4">
      <h3 className="text-sm font-semibold">{initial?.number ? `Edit draft #${initial.number}` : "New bounty"}</h3>
      <label className="block text-xs font-semibold">Title<input required maxLength={200} value={form.title} onChange={set("title")} className={field} /></label>
      <label className="block text-xs font-semibold">Description<textarea rows={2} maxLength={4000} value={form.description} onChange={set("description")} className={field} /></label>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-xs font-semibold">GitHub issue
          <select value={issues.some((item) => String(item.number) === form.issueNumber) ? form.issueNumber : ""} onChange={pickIssue} className={field}>
            <option value="">{issues.length ? "Choose an open issue…" : "No open issues loaded"}</option>
            {issues.map((item) => (
              <option key={item.number} value={item.number} disabled={Boolean(item.bountyNumber) && String(item.number) !== form.issueNumber}>
                #{item.number} {item.title.slice(0, 60)}{item.bountyNumber ? ` (bounty #${item.bountyNumber})` : ""}
              </option>
            ))}
          </select>
          {issuesNote && <span className="mt-1 block text-[11px] font-normal text-ob-slate">{issuesNote}</span>}
        </label>
        <label className="block text-xs font-semibold">or issue #<input inputMode="numeric" value={form.issueNumber} onChange={(event) => setForm((c) => ({ ...c, issueNumber: event.target.value.replace(/\D/g, "").slice(0, 7) }))} className={field} /></label>
        <label className="block text-xs font-semibold">Reward (USDT)<input required inputMode="decimal" placeholder="25" value={form.amount} onChange={set("amount")} className={field} /></label>
        <label className="block text-xs font-semibold">Submission deadline<input required type="datetime-local" value={form.submissionDeadline} onChange={set("submissionDeadline")} className={field} /></label>
      </div>
      <label className="block text-xs font-semibold">
        Acceptance criteria (one per line). These are locked and hashed into the escrow at funding.
        <textarea required rows={5} value={form.criteria} onChange={set("criteria")} className={`${field} font-mono text-xs`} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={draftWith0g} disabled={Boolean(busy) || (!form.title && !form.issueNumber)} className="inline-flex items-center gap-1 rounded-lg border border-ob-line bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
          <Sparkles className="size-3" /> {busy === "draft" ? "Drafting on 0G…" : "Draft criteria with 0G"}
        </button>
        <button type="submit" disabled={Boolean(busy)} className="rounded-lg bg-ob-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === "save" ? "Saving…" : "Save draft"}</button>
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xs">Cancel</button>
      </div>
      {draftInfo && <p className="text-xs text-ob-slate">{draftInfo}</p>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </form>
  );
}

function BountyDetail({ base, slug, summary, limitation, onChanged }) {
  const [bounty, setBounty] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const path = `${base}/${summary.number}`;

  const load = useCallback(async () => {
    try {
      const result = await apiRequest(path);
      setBounty(result.bounty);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [path]);

  useEffect(() => { load(); }, [load, summary.status, summary.claimRequests?.length, summary.submission?.prNumber, summary.receipts?.length]);
  // A new report means any earlier acknowledgement of warnings no longer applies.
  useEffect(() => { setAcknowledge(false); }, [bounty?.review?.reportHash]);

  // Keep the explorer link visible: the button that produced it disappears once the bounty moves on.
  const done = (outcome) => {
    if (outcome?.explorer) setNotice(`Confirmed on chain. Receipt: ${outcome.explorer}`);
    load();
    onChanged();
  };
  async function plain(key, request, success) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const result = await request();
      if (result?.bounty) setBounty(result.bounty);
      if (success) setNotice(typeof success === "function" ? success(result) : success);
      await load();
      onChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  if (!bounty) return <div className="border-t border-ob-line p-3 text-xs text-ob-slate">{error || "Loading…"}</div>;
  const v = bounty.viewer;
  if (editing) {
    return <div className="border-t border-ob-line p-3"><BountyForm slug={slug} base={base} initial={{
      number: bounty.number, title: bounty.title, description: bounty.description, issueNumber: bounty.issue?.number ? String(bounty.issue.number) : "",
      amount: bounty.amountDisplay, submissionDeadline: toLocalInput(bounty.submissionDeadline),
      criteria: bounty.criteria.map((c) => c.text).join("\n"),
    }} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); done(); }} /></div>;
  }

  return (
    <div className="space-y-4 border-t border-ob-line p-4 text-sm">
      {bounty.description && <p className="whitespace-pre-wrap text-ob-navy">{bounty.description}</p>}
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div><dt className="text-ob-slate">Reward</dt><dd className="font-semibold">{bounty.amountDisplay} USDT</dd></div>
        <div><dt className="text-ob-slate">Submission deadline</dt><dd>{isoDate(bounty.submissionDeadline)}</dd></div>
        <div><dt className="text-ob-slate">Issue</dt><dd>{bounty.issue ? <a className="underline" href={bounty.issue.url} target="_blank" rel="noreferrer">#{bounty.issue.number} {bounty.issue.title}</a> : "–"}</dd></div>
        {bounty.claimant && <div><dt className="text-ob-slate">Claimant</dt><dd>{bounty.claimant.name} (@{bounty.claimant.githubLogin}) · <code>{shortAddress(bounty.claimant.account)}</code></dd></div>}
        {bounty.claimExpiry && bounty.status === "claimed" && <div><dt className="text-ob-slate">Claim expires</dt><dd>{isoDate(bounty.claimExpiry)}</dd></div>}
        {bounty.submission && <div><dt className="text-ob-slate">Submission</dt><dd><a className="underline" href={bounty.submission.prUrl} target="_blank" rel="noreferrer">PR #{bounty.submission.prNumber}</a>{bounty.submission.registered ? " · registered on chain" : bounty.submission.error ? ` · ${bounty.submission.error}` : " · registering…"}</dd></div>}
      </dl>

      <div>
        <p className="text-xs font-semibold">Acceptance criteria <span className="font-mono font-normal text-ob-slate">{bounty.criteriaHash.slice(0, 10)}…</span></p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs">{bounty.criteria.map((c) => <li key={c.id}>{c.text}</li>)}</ol>
      </div>

      {["draft", "funding", "funded", "claimed"].includes(bounty.status) && (
        <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">{limitation} Unsubmitted claims expire after 72 hours or at the deadline, whichever is first.</p>
      )}

      {/* Maintainer: draft and funding */}
      {v.canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-ob-line px-3 py-2 text-xs font-semibold">Edit draft</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => plain("delete", () => apiRequest(path, { method: "DELETE" }), "Draft deleted.")} className="rounded-lg border border-ob-line px-3 py-2 text-xs">Delete draft</button>
        </div>
      )}
      {v.canFund && <PasskeyAction label={`Fund ${bounty.amountDisplay} USDT`} prepare={() => apiRequest(`${path}/fund`, { method: "POST" })} onDone={done} />}

      {/* Contributor: request a claim */}
      {v.canRequestClaim && (
        <div className="space-y-2">
          <textarea rows={2} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="How you plan to solve it (optional)" className="w-full rounded-lg border border-ob-line p-2 text-xs" />
          <button type="button" disabled={Boolean(busy)} onClick={() => plain("claim", () => apiRequest(`${path}/claims`, { method: "POST", body: { message } }), "Claim requested. A maintainer will review it.")}
            className="rounded-lg bg-ob-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Request this bounty</button>
        </div>
      )}
      {bounty.status === "funded" && !v.maintainer && !v.canRequestClaim && !bounty.myClaimRequest && (
        <p className="text-xs text-ob-slate">Create a payment account (Wallet) to request this bounty.</p>
      )}
      {bounty.myClaimRequest && (
        <p className="text-xs text-ob-slate">You requested this bounty. <button type="button" className="underline" onClick={() => plain("withdraw", () => apiRequest(`${path}/claims/mine`, { method: "DELETE" }), "Request withdrawn.")}>Withdraw</button></p>
      )}

      {/* Maintainer: accept one claimant */}
      {v.maintainer && bounty.claimRequests.length > 0 && bounty.status === "funded" && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Claim requests</p>
          {bounty.claimRequests.map((request) => (
            <div key={request.id} className="rounded-lg border border-ob-line p-2 text-xs">
              <p><strong>{request.name}</strong> (@{request.githubLogin}) · <code>{shortAddress(request.account)}</code> · {isoDate(request.at)}</p>
              {request.message && <p className="mt-1 text-ob-slate">{request.message}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <PasskeyAction compact label="Accept claim" prepare={() => apiRequest(`${path}/claims/${request.id}/accept`, { method: "POST" })} onDone={done} />
                <button type="button" onClick={() => plain("decline", () => apiRequest(`${path}/claims/${request.id}/decline`, { method: "POST" }))} className="rounded-lg border border-ob-line px-2 py-1 text-[11px]">Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Claimant: register the PR before the claim expires */}
      {v.canSubmit && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          plain("submit", () => apiRequest(`${path}/submission`, { method: "POST", body: { prNumber: Number(prNumber) } }),
            (result) => `Submission registered on chain. The 0G reviewer is checking PR #${prNumber}. ${result.explorer ? "Receipt: " + result.explorer : ""}`);
        }}>
          <label className="text-xs font-semibold">Your PR number<input inputMode="numeric" value={prNumber} onChange={(event) => setPrNumber(event.target.value.replace(/\D/g, "").slice(0, 7))} className="mt-1 block w-28 rounded-lg border border-ob-line p-2 font-normal" /></label>
          <button type="submit" disabled={!prNumber || Boolean(busy)} className="rounded-lg bg-ob-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === "submit" ? "Registering…" : "Submit PR"}</button>
          <span className="text-[11px] text-ob-slate">OpenBounty checks the PR is yours and registers it on chain (no passkey or fee needed).</span>
        </form>
      )}

      {/* Review evidence + payout */}
      {bounty.review && <EvidenceReport report={bounty.review} />}
      {bounty.status === "submitted" && !bounty.review && <p className="text-xs text-ob-slate">Waiting for the 0G evidence report for PR #{bounty.submission?.prNumber}. Run <code>/review {bounty.submission?.prNumber}</code> in chat if it does not appear.</p>}
      {(v.canToggleAutoPay || bounty.autoPay?.enabled) && (
        <div className="space-y-1 rounded-lg border border-ob-line p-3">
          <label className="flex items-start gap-2 text-xs font-semibold">
            <input type="checkbox" checked={Boolean(bounty.autoPay?.enabled)} disabled={!v.canToggleAutoPay || Boolean(busy)}
              onChange={(event) => plain("autopay", () => apiRequest(`${path}/autopay`, { method: "POST", body: { enabled: event.target.checked } }),
                event.target.checked ? "Automatic payout is on. The reward is released after the PR is merged and the 0G report recommends approval." : "Automatic payout is off.")} />
            <span>Pay automatically when the PR is merged and the 0G report recommends approval</span>
          </label>
          <p className="text-[11px] text-ob-slate">
            Merging on GitHub is your approval. If the report asks for a person, the PR changes or the reward is above the escrow owner&rsquo;s limit, nothing is paid automatically and you can still approve manually.
          </p>
          {bounty.autoPay?.enabled && bounty.autoPay.state && (
            <p role="status" className={`text-[11px] ${["blocked", "failed"].includes(bounty.autoPay.state) ? "text-amber-800" : "text-ob-slate"}`}>
              Automatic payout: {{ waiting: "waiting", processing: "sending", paid: "paid", blocked: "paused", failed: "failed" }[bounty.autoPay.state]}
              {bounty.autoPay.reason ? ` — ${bounty.autoPay.reason}` : ""}{bounty.autoPay.by ? ` (enabled by ${bounty.autoPay.by})` : ""}
            </p>
          )}
        </div>
      )}
      {v.canApprovePayout && (
        <div className="space-y-2 rounded-lg border border-ob-line p-3">
          <p className="text-xs font-semibold">Approve payout</p>
          <p className="text-[11px] text-ob-slate">OpenBounty re-checks GitHub (merged PR by the claimant, unchanged head), requires a current 0G report for these criteria, then binds the reviewed commit, merge commit and report hash into the payment. The AI assessment is advisory; you decide.</p>
          {bounty.review && bounty.review.verdict !== "ready_for_approval" && (
            <label className="flex items-start gap-2 text-[11px]"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} />I reviewed the evidence and approve despite the report saying &ldquo;{bounty.review.status}&rdquo;.</label>
          )}
          <PasskeyAction label={`Pay ${bounty.amountDisplay} USDT to ${bounty.claimant?.name || "claimant"}`}
            prepare={() => apiRequest(`${path}/payout`, { method: "POST", body: { acknowledgeWarnings: acknowledge, reportHash: bounty.review?.reportHash || "" } })} onDone={done} />
        </div>
      )}

      {/* Refund, cancellation, expiry */}
      <div className="flex flex-wrap gap-2">
        {v.canRefund && <PasskeyAction tone="danger" label="Refund to funder" prepare={() => apiRequest(`${path}/refund`, { method: "POST" })} onDone={done} />}
        {v.canConsentCancel && <PasskeyAction tone="secondary" label="Agree to cancel" prepare={() => apiRequest(`${path}/cancel/consent`, { method: "POST" })} onDone={done} />}
        {bounty.cancelConsent && <span className="self-center text-[11px] text-ob-slate">Claimant agreed to cancel (until {isoDate(bounty.cancelConsent.deadline * 1000)}).</span>}
        {v.canCancel && <PasskeyAction tone="danger" label="Cancel by agreement" prepare={() => apiRequest(`${path}/cancel`, { method: "POST" })} onDone={done} />}
        {v.canExpire && <button type="button" disabled={Boolean(busy)} onClick={() => plain("expire", () => apiRequest(`${path}/expire`, { method: "POST" }), "Claim released. The bounty is open again.")} className="rounded-lg border border-ob-line px-3 py-2 text-xs">Release expired claim</button>}
        {!["draft"].includes(bounty.status) && <button type="button" disabled={Boolean(busy)} onClick={() => plain("sync", () => apiRequest(`${path}/resync`, { method: "POST" }), "Synced with the escrow.")} className="rounded-lg px-3 py-2 text-xs text-ob-slate underline">Sync with escrow</button>}
      </div>

      {bounty.receipts.length > 0 && (
        <div>
          <p className="text-xs font-semibold">Payment receipts</p>
          <ul className="mt-1 space-y-1 text-[11px]">
            {bounty.receipts.map((receipt) => (
              <li key={receipt.hash}>{receipt.label}: <a className="font-mono underline" href={receipt.url} target="_blank" rel="noreferrer">{receipt.hash.slice(0, 18)}… <ExternalLink className="inline size-3" /></a></li>
            ))}
          </ul>
          <p className="mt-1 break-all text-[10px] text-ob-slate">Escrow bounty id {bounty.escrow.bountyId}{bounty.escrow.refundReason && ` · refund reason: ${bounty.escrow.refundReason.replaceAll("_", " ")}`}</p>
        </div>
      )}
      {notice && <p role="status" className="break-all text-xs text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
