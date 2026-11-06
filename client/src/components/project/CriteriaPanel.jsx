import { useEffect, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";

const MAX_ITEMS = 20;
const MAX_LENGTH = 500;

export default function CriteriaPanel({ slug }) {
  const path = `/projects/${encodeURIComponent(slug)}/criteria`;
  const [criteria, setCriteria] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [items, setItems] = useState([]);
  const [task, setTask] = useState("");
  const [issueNumber, setIssueNumber] = useState("");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest(path)
      .then((result) => {
        if (!active) return;
        setCriteria(result.criteria);
        setCanEdit(result.canEdit);
        setItems(result.criteria.items.map((item) => item.text));
      })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [path]);

  const clean = items.map((text) => text.trim()).filter(Boolean);
  const approvedTexts = criteria?.items.map((item) => item.text) || [];
  const changed = JSON.stringify(clean) !== JSON.stringify(approvedTexts);
  const invalid = !clean.length || clean.length > MAX_ITEMS || clean.some((text) => text.length > MAX_LENGTH);

  async function requestDraft(event) {
    event.preventDefault();
    setBusy("draft");
    setError("");
    setNotice("");
    try {
      const result = await apiRequest(`${path}/draft`, {
        method: "POST", body: { task, issueNumber: issueNumber ? Number(issueNumber) : null },
      });
      setDraft(result.draft);
      setItems(result.draft.items);
      setNotice("Draft loaded into the editor. Edit it, then approve when it matches the task.");
    } catch (draftError) {
      setError(draftError.message);
    } finally {
      setBusy("");
    }
  }

  async function approve() {
    setBusy("approve");
    setError("");
    setNotice("");
    try {
      const result = await apiRequest(path, {
        method: "PUT", body: { items: clean, expectedVersion: criteria?.version || 0 },
      });
      setCriteria(result.criteria);
      setItems(result.criteria.items.map((item) => item.text));
      setDraft(null);
      setNotice(`Criteria v${result.criteria.version} approved. Earlier PR evidence is now stale; new reviews use this version.`);
    } catch (approveError) {
      setError(approveError.message);
    } finally {
      setBusy("");
    }
  }

  const update = (index, value) => setItems((current) => current.map((text, i) => i === index ? value : text));

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-6" aria-label="Acceptance criteria">
      <h2 className="font-serif text-2xl">Acceptance criteria</h2>
      <p className="my-2 text-xs text-ob-slate">
        The 0G scope assistant drafts criteria. A maintainer edits and approves them; the reviewer checks every PR against the approved version.
      </p>

      {criteria && (
        <div className="mt-4 rounded-[14px] border border-ob-line bg-white p-4 text-sm">
          <p className="text-xs font-semibold text-ob-slate">
            {criteria.version ? <>Approved v{criteria.version} · <code>{criteria.hash}</code>{criteria.approvedByName && <> · by {criteria.approvedByName}</>}
              {criteria.approvedAt && <> · {new Date(criteria.approvedAt).toLocaleString()}</>}</> : "No criteria approved yet."}
          </p>
          {criteria.items.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {criteria.items.map((item) => <li key={item.id}><span className="font-mono text-[11px] text-ob-slate">{item.id}</span> {item.text}</li>)}
            </ol>
          )}
        </div>
      )}

      {canEdit && (
        <>
          <form onSubmit={requestDraft} className="mt-6 space-y-2 rounded-[14px] border border-ob-line bg-[#f8fafc] p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4" /> Draft with 0G</h3>
            <label className="block text-xs font-semibold">
              Task
              <textarea value={task} onChange={(event) => setTask(event.target.value)} maxLength={2000} rows={3}
                placeholder="Fix the double-submit bug on the contact form"
                className="mt-1 w-full rounded-lg border border-ob-line bg-white p-2 text-sm font-normal" />
            </label>
            <label className="block text-xs font-semibold">
              GitHub issue number (optional)
              <input value={issueNumber} onChange={(event) => setIssueNumber(event.target.value.replace(/\D/g, "").slice(0, 7))}
                inputMode="numeric" placeholder="12" className="mt-1 w-32 rounded-lg border border-ob-line bg-white p-2 text-sm font-normal" />
            </label>
            <button type="submit" disabled={Boolean(busy) || (!task.trim() && !issueNumber)}
              className="rounded-lg bg-ob-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "draft" ? "Drafting on 0G…" : "Draft criteria"}
            </button>
            {draft && (
              <div className="space-y-2 pt-2 text-xs text-ob-slate">
                <p>
                  0G request <code className="font-mono">{draft.requestId}</code>{draft.model && <> · {draft.model}</>}
                  {draft.provider && <> · provider {draft.provider}</>}{draft.e2ee && <> · E2EE {draft.e2ee}</>}
                  {draft.repoSha && <> · repo @ <code className="font-mono">{draft.repoSha.slice(0, 7)}</code></>}
                  {draft.issue && <> · issue <a className="underline" href={draft.issue.url} target="_blank" rel="noreferrer">#{draft.issue.number}</a></>}
                </p>
                {draft.ambiguities.length > 0 && <div><p className="font-semibold text-ob-navy">Open questions</p><ul className="list-disc pl-5">{draft.ambiguities.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
                {draft.regressionChecks.length > 0 && <div><p className="font-semibold text-ob-navy">Regression checks</p><ul className="list-disc pl-5">{draft.regressionChecks.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
              </div>
            )}
          </form>

          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold">Edit and approve</h3>
            {items.map((text, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-right font-mono text-[11px] text-ob-slate">c{index + 1}</span>
                <textarea value={text} onChange={(event) => update(index, event.target.value)} rows={2} maxLength={MAX_LENGTH}
                  aria-label={`Criterion ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-ob-line bg-white p-2 text-sm" />
                <button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove criterion ${index + 1}`} className="mt-1 rounded-lg p-2 text-ob-slate hover:bg-ob-mist">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" disabled={items.length >= MAX_ITEMS} onClick={() => setItems((current) => [...current, ""])}
                className="inline-flex items-center gap-1 rounded-lg border border-ob-line px-3 py-2 text-xs font-semibold disabled:opacity-50">
                <Plus className="size-3" /> Add criterion
              </button>
              <button type="button" onClick={approve} disabled={Boolean(busy) || invalid || !changed}
                className="rounded-lg bg-ob-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy === "approve" ? "Approving…" : `Approve as v${(criteria?.version || 0) + 1}`}
              </button>
            </div>
            <p className="text-xs text-ob-slate">Approving creates a new version. Reports made against older versions become stale.</p>
          </div>
        </>
      )}
      {!canEdit && criteria && <p className="mt-4 text-xs text-ob-slate">Only the project owner or a co-owner can change criteria. Ask the agent with <code>/criteria</code> to suggest some in chat.</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
