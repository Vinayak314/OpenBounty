import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

const ROLE_LABELS = { guide: "Project guide", scope: "Scope assistant", reviewer: "Code reviewer" };
const VERDICTS = { ready_for_approval: "Recommend approval", changes_requested: "Changes requested", needs_maintainer: "Maintainer review needed" };

export default function AgentActivityPanel({ slug }) {
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function refresh() {
      try {
        const result = await apiRequest(`/projects/${encodeURIComponent(slug)}/ai/activity`, { signal: controller.signal });
        if (!controller.signal.aborted) { setActivity(result); setError(""); }
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 10000);
      }
    }
    refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [slug]);

  const totals = activity?.totals;
  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" aria-label="0G agent activity">
      <h2 className="font-serif text-2xl">0G activity</h2>
      <p className="my-2 text-xs text-ob-slate">
        Every agent answer, criteria draft and PR review in this project runs on 0G Private Computer. A request ID identifies one inference run; it does not prove the output is correct.
      </p>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!activity && !error && <p role="status" className="text-sm text-ob-slate">Loading activity…</p>}
      {activity && (
        <>
          <p className="text-xs text-ob-slate">
            {activity.provider.provider} · model {activity.provider.model} · {activity.provider.configured && activity.provider.enabled ? "connected" : "not configured"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="0G runs" value={totals.runs} />
            {Object.entries(ROLE_LABELS).map(([role, label]) => <Stat key={role} label={label} value={totals.byRole[role]?.runs || 0} />)}
            <Stat label="Failures shown" value={totals.errors} />
          </div>
          {totals.tokens > 0 && <p className="mt-2 text-xs text-ob-slate">{totals.tokens.toLocaleString()} tokens reported by the router.</p>}

          <ol className="mt-6 space-y-2">
            {activity.recent.length === 0 && <li className="text-sm text-ob-slate">No agent activity yet. Try <code>/explain</code> in chat.</li>}
            {activity.recent.map((item) => (
              <li key={item.id} className="rounded-[12px] border border-ob-line bg-white p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{ROLE_LABELS[item.role] || item.role}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.status === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                    {item.status === "ok" ? "ok" : item.errorCode || "error"}
                  </span>
                  <span className="text-ob-slate">{new Date(item.at).toLocaleString()}</span>
                  {item.review && <span className="text-ob-slate">PR #{item.review.prNumber} @ <code>{item.review.headSha.slice(0, 7)}</code> · {VERDICTS[item.review.verdict]}{item.review.stale && " (stale)"}</span>}
                </div>
                {item.requestId && (
                  <p className="mt-1 break-all text-[11px] text-ob-slate">
                    0G request <code className="font-mono">{item.requestId}</code>{item.model && <> · {item.model}</>}
                    {item.provider && <> · provider {item.provider}</>}{item.e2ee && <> · E2EE {item.e2ee}</>}
                    {item.tokens > 0 && <> · {item.tokens} tokens</>}
                    {item.repoSha && <> · repo @ <code className="font-mono">{item.repoSha.slice(0, 7)}</code></>}
                  </p>
                )}
                <p className="mt-1 truncate text-ob-navy">{item.summary}</p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-[12px] border border-ob-line bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ob-slate">{label}</p>
      <p className="mt-1 font-serif text-2xl text-ob-navy">{value}</p>
    </div>
  );
}
