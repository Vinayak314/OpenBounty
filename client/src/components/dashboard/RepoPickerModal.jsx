import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { iconProps } from "@/components/layout/icon";

/** Choose one of the signed-in user's GitHub repositories to add as a project. */
export default function RepoPickerModal({ open, repos, addedIds, onPick, onClose, loading = false, error = "" }) {
  const [q, setQ] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const input = useRef(null);
  // Clear the search each time the dialog opens (adjusting state during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQ("");
  }

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const list = repos.filter((r) => `${r.name} ${r.fullName}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ob-navy/40 px-4 pt-[14vh] backdrop-blur-[2px] animate-[pop_.15s_ease-out]" onMouseDown={onClose}>
      <div role="dialog" aria-label="Choose a repository" onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-[460px] rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-2xl animate-[rise_.2s_ease-out]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[24px] text-ob-navy">Choose a repository</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-ob-slate transition-colors hover:bg-ob-mist hover:text-ob-navy"><X {...iconProps} size={18} /></button>
        </div>
        <label className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 focus-within:border-ob-navy/50">
          <Search {...iconProps} size={16} className="text-ob-slate" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your repositories" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ob-slate" />
        </label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}
        <ul className="mt-3 flex max-h-[320px] flex-col gap-2 overflow-y-auto">
          {loading && <li className="py-8 text-center text-xs text-ob-slate">Loading your GitHub repositories…</li>}
          {!loading && list.length === 0 && <li className="py-8 text-center text-xs text-ob-slate">{q ? `No repositories match “${q}”.` : "No public repositories found."}</li>}
          {!loading && list.map((repo) => {
            const added = addedIds.has(repo.fullName.toLowerCase());
            return <li key={repo.id}>
              <button type="button" disabled={added} onClick={() => onPick(repo)} className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-3 text-left transition-all duration-150 enabled:hover:border-[#e5e7eb] enabled:hover:bg-ob-mist/50 disabled:opacity-50">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-ob-mist text-xs font-semibold text-ob-navy">{repo.private ? "Private" : "Git"}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ob-navy">{repo.name}</span><span className="block truncate text-[11px] text-ob-slate">{repo.fullName} · {repo.description}</span></span>
                <span className="flex items-center gap-1 text-xs font-semibold text-ob-navy">{added ? <><Check {...iconProps} size={14} /> Added</> : <span className="opacity-0 transition-opacity group-hover:opacity-100">Add →</span>}</span>
              </button>
            </li>;
          })}
        </ul>
      </div>
    </div>
  );
}
