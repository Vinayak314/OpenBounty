import { useState } from "react";
import { apiRequest } from "@/lib/api";

export default function GroupInvites({ slug }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(null);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const path = `/groups/project/${encodeURIComponent(slug)}`;

  async function load() {
    const result = await apiRequest(path);
    setCode(result.code);
    setRequests(result.requests);
  }

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    setOpen(!open);
    if (!open) run(load);
  }

  async function decide(requestId, decision) {
    await apiRequest(`${path}/requests/${requestId}`, { method: "PATCH", body: { decision } });
    setRequests((current) => current.filter((request) => request.id !== requestId));
  }

  return (
    <section className="mt-5 border-t border-ob-line pt-4" aria-label="Group invites">
      <button type="button" aria-expanded={open} onClick={toggle} disabled={busy}
        className="text-sm font-semibold text-ob-navy hover:underline">Group invites</button>
      {open && <div className="mt-2 space-y-3 text-xs">
        {code ? (
          <div className="flex items-center justify-between rounded-lg bg-ob-mist px-3 py-2">
            <code className="font-semibold tracking-widest">{code}</code>
            <button type="button" onClick={() => run(async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            })} disabled={busy} className="font-semibold hover:underline">{copied ? "Copied" : "Copy"}</button>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => run(async () => {
            const result = await apiRequest(`${path}/code`, { method: "POST" });
            setCode(result.code);
          })} className="rounded-lg bg-ob-navy px-3 py-2 font-semibold text-white disabled:opacity-50">Generate join code</button>
        )}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Join requests</h3>
          <button type="button" disabled={busy} onClick={() => run(load)} className="text-ob-slate hover:underline">Refresh</button>
        </div>
        {error && <p role="alert" className="text-rose-700">{error}</p>}
        {busy && <p role="status" className="text-ob-slate">Working…</p>}
        {!busy && !requests.length && <p className="text-ob-slate">No pending requests.</p>}
        {requests.length > 0 && <ul className="space-y-2">
          {requests.map((request) => <li key={request.id} className="space-y-2 rounded-lg border border-ob-line p-2">
            <p className="break-words font-semibold">{request.name}</p>
            {request.username && <p className="break-words text-ob-slate">@{request.username}</p>}
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={() => run(() => decide(request.id, "approve"))} className="font-semibold hover:underline">Approve</button>
              <button type="button" disabled={busy} onClick={() => run(() => decide(request.id, "decline"))} className="text-ob-slate hover:underline">Decline</button>
            </div>
          </li>)}
        </ul>}
      </div>}
    </section>
  );
}
