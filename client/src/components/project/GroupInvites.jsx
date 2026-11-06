import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

export default function GroupInvites({ slug }) {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(null);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const path = `/groups/project/${encodeURIComponent(slug)}`;

  useEffect(() => {
    if (busy) return;
    let active = true;
    let timer;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await apiRequest(path, { signal: controller.signal });
        if (!active) return;
        setCode(result.code);
        setRequests(result.requests);
        setError("");
      } catch (error) {
        if (active) setError(error.message);
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(load, 5000);
        }
      }
    }
    load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, busy]);

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

  async function decide(requestId, decision) {
    await apiRequest(`${path}/requests/${requestId}`, { method: "PATCH", body: { decision } });
    setRequests((current) => current.filter((request) => request.id !== requestId));
  }

  return (
    <section className="mt-5 border-t border-ob-line pt-4" aria-label="Group invites">
      <h2 className="text-sm font-semibold text-ob-navy">Group invites</h2>
      <div className="mt-2 space-y-3 text-xs">
        {code ? (
          <div className="flex items-center justify-between rounded-lg bg-ob-mist px-3 py-2">
            <code className="font-semibold tracking-widest">{code}</code>
            <button type="button" onClick={() => run(async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            })} disabled={busy} className="font-semibold hover:underline">{copied ? "Copied" : "Copy"}</button>
          </div>
        ) : !loading && (
          <button type="button" disabled={busy} onClick={() => run(async () => {
            const result = await apiRequest(`${path}/code`, { method: "POST" });
            setCode(result.code);
          })} className="rounded-lg bg-ob-navy px-3 py-2 font-semibold text-white disabled:opacity-50">Generate join code</button>
        )}
        <h3 className="font-semibold">Join requests</h3>
        {error && <p role="alert" className="text-rose-700">{error}</p>}
        {(busy || loading) && <p role="status" className="text-ob-slate">Working…</p>}
        {!busy && !loading && !error && !requests.length && <p className="text-ob-slate">No pending requests.</p>}
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
      </div>
    </section>
  );
}
