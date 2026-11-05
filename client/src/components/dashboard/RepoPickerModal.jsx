import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Search, Sprout, Waves, X } from "lucide-react";
import { iconProps } from "@/components/layout/icon";

const ICONS = { sprout: Sprout, "book-open": BookOpen, waves: Waves };

/** Modal to choose a repository to add as a project. */
export default function RepoPickerModal({ open, repos, addedIds, onPick, onClose }) {
  const [q, setQ] = useState("");
  const input = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    input.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const list = repos.filter((r) => `${r.name} ${r.repo}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ob-navy/40 px-4 pt-[14vh] backdrop-blur-[2px] animate-[pop_.15s_ease-out]" onMouseDown={onClose}>
      <div role="dialog" aria-label="Choose a repository" onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-[460px] rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-2xl animate-[rise_.2s_ease-out]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[24px] text-ob-navy">Choose a repository</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-ob-slate transition-colors hover:bg-ob-mist hover:text-ob-navy">
            <X {...iconProps} size={18} />
          </button>
        </div>
        <label className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 focus-within:border-ob-navy/50">
          <Search {...iconProps} size={16} className="text-ob-slate" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your repositories" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ob-slate" />
        </label>
        <ul className="mt-3 flex max-h-[320px] flex-col gap-2 overflow-y-auto">
          {list.length === 0 && <li className="py-8 text-center text-xs text-ob-slate">No repositories match “{q}”.</li>}
          {list.map((r) => {
            const Icon = ICONS[r.icon] ?? Sprout;
            const added = addedIds.has(r.id);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => onPick(r)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-3 text-left transition-all duration-150 enabled:hover:border-[#e5e7eb] enabled:hover:bg-ob-mist/50 disabled:opacity-50"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-ob-mist">
                    <Icon {...iconProps} size={20} className="text-ob-navy" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ob-navy">{r.name}</span>
                    <span className="block truncate text-[11px] text-ob-slate">{r.repo} · {r.description}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-ob-navy">
                    {added ? <><Check {...iconProps} size={14} /> Added</> : <span className="opacity-0 transition-opacity group-hover:opacity-100">Add →</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
