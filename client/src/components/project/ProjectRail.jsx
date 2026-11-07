import { useState } from "react";
import { ArrowUpRight, ChevronDown, Github, PanelRightClose, PanelRightOpen, Terminal, X } from "lucide-react";
import GroupInvites from "@/components/project/GroupInvites";
import { COMMANDS } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import { DrawerBackdrop } from "@/components/layout/NavDrawer";
import { useNavDrawer, useScrollLock } from "@/components/layout/navDrawerState";

const STORAGE_KEY = "ob:project-rail";

function readPrefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}

// The composer listens for this and puts the text in the message box.
const composeCommand = (text) => window.dispatchEvent(new CustomEvent("ob:compose", { detail: { text } }));

function Section({ id, title, icon: Icon, open, onToggle, children }) {
  return (
    <section className="border-t border-ob-line py-4 first:border-t-0 first:pt-0">
      <button type="button" aria-expanded={open} aria-controls={`rail-${id}`} onClick={onToggle}
        className="flex w-full items-center gap-2 text-left text-[12px] font-semibold text-ob-navy">
        {Icon && <Icon className="size-4 shrink-0" strokeWidth={1.8} />}
        <span className="flex-1">{title}</span>
        <ChevronDown className={`size-4 shrink-0 text-ob-slate transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div id={`rail-${id}`} className="mt-3">{children}</div>}
    </section>
  );
}

export default function ProjectRail({ project }) {
  const [prefs, setPrefs] = useState(() => ({ collapsed: false, about: true, commands: true, ...readPrefs() }));
  const update = (patch) => setPrefs((current) => { const next = { ...current, ...patch }; savePrefs(next); return next; });
  const { panel, close } = useNavDrawer();
  const drawerOpen = panel === "details";
  useScrollLock(drawerOpen);

  // The desktop "collapsed" preference only applies where the panel is a column; on a phone it is a drawer.
  if (prefs.collapsed && !drawerOpen) {
    return (
      <aside className="hidden w-[44px] shrink-0 flex-col items-center border-l border-ob-line pt-[22px] lg:flex">
        <button type="button" aria-label="Show project details" title="Show project details" onClick={() => update({ collapsed: false })}
          className="flex size-8 items-center justify-center rounded-full text-ob-navy hover:bg-ob-mist">
          <PanelRightOpen className="size-[18px]" strokeWidth={1.8} />
        </button>
      </aside>
    );
  }

  return (
    <>
    <DrawerBackdrop name="details" breakpoint="lg" />
    <aside className={cn(
      // Below lg the details slide in from the right; from lg up they are a column beside the conversation.
      "fixed inset-y-0 right-0 z-50 w-[300px] max-w-[88vw] shrink-0 overflow-y-auto border-l border-ob-line bg-[#f8fafc] px-[18px] pb-6 pt-[22px] transition-transform duration-200 ease-out",
      "lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:bg-transparent",
      drawerOpen ? "translate-x-0 shadow-2xl" : "translate-x-full",
    )}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-serif text-[24px] leading-tight text-ob-navy">Project details</h2>
        <button type="button" aria-label="Close project details" onClick={close}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ob-navy hover:bg-ob-mist lg:hidden">
          <X className="size-[18px]" strokeWidth={1.8} />
        </button>
        <button type="button" aria-label="Hide project details" title="Hide project details" onClick={() => update({ collapsed: true })}
          className="hidden size-8 shrink-0 items-center justify-center rounded-full text-ob-navy hover:bg-ob-mist lg:flex">
          <PanelRightClose className="size-[18px]" strokeWidth={1.8} />
        </button>
      </div>

      <Section id="about" title="About" open={prefs.about} onToggle={() => update({ about: !prefs.about })}>
        <p className="break-words text-[12px] leading-5 text-ob-slate">{project?.description || "Your project workspace is ready for discussion."}</p>
        <p className="mt-2 text-[11px] leading-5 text-ob-slate">Chat messages are saved to this project and visible to its members.</p>
        {project?.repository?.url && <a href={project.repository.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 rounded-lg border border-ob-line p-3 text-[11px] font-semibold text-ob-navy hover:bg-ob-mist"><Github className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{project.repository.fullName}</span><ArrowUpRight className="size-3 shrink-0" /></a>}
        {project?.canManageGroup && <GroupInvites key={project.slug} slug={project.slug} />}
      </Section>

      <Section id="commands" title="Agent commands" icon={Terminal} open={prefs.commands} onToggle={() => update({ commands: !prefs.commands })}>
        <ul className="divide-y divide-ob-line overflow-hidden rounded-[10px] border border-ob-line bg-white">
          {COMMANDS.map((c) => (
            <li key={c.cmd}>
              <button type="button" title={c.description} onClick={() => { composeCommand(`${c.cmd} `); close(); }}
                className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-ob-mist">
                <code className="shrink-0 text-[11px] font-semibold text-ob-navy">{c.usage}</code>
                <span className="truncate text-[10px] text-ob-slate">{c.short}</span>
              </button>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-2 px-3 py-2">
            <code className="shrink-0 text-[11px] font-semibold text-ob-navy">@agent</code>
            <span className="truncate text-[10px] text-ob-slate">Ask anything</span>
          </li>
        </ul>
      </Section>
    </aside>
    </>
  );
}
