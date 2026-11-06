import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Flower2 } from "lucide-react";
import { VIEWS } from "@/components/project/views";

export default function ProjectSidebar({ project, view, onView }) {
  return (
    <aside className="flex w-[238px] shrink-0 flex-col overflow-y-auto border-r border-ob-line bg-[#f8fafc] px-5 pb-[30px] pt-[26px]">
      <Link to="/" className="flex items-center gap-[10px]">
        <span className="flex size-[34px] items-center justify-center rounded-full bg-ob-mist"><Flower2 className="size-[20px] text-ob-navy" strokeWidth={1.6} /></span>
        <span className="font-serif text-[25px] font-bold tracking-[-0.8px] text-ob-navy">OpenBounty</span>
      </Link>
      <Link to="/dashboard" className="mt-[22px] flex items-center gap-1 text-[11px] font-medium text-ob-slate hover:text-ob-navy"><ArrowLeft className="size-3" /> Dashboard</Link>
      <h2 title={project?.name} className="mt-[28px] break-words font-serif text-[28px] leading-[1.1] text-ob-navy">{project?.name || "Project"}</h2>
      {project?.repository?.url && <a href={project.repository.url} target="_blank" rel="noreferrer" className="mt-[10px] flex min-w-0 items-center gap-1 text-[11px] text-ob-slate hover:text-ob-navy"><span className="truncate">{project.repository.fullName}</span><ArrowUpRight className="size-3 shrink-0" /></a>}
      <nav className="mt-[26px] flex flex-col gap-1" aria-label="Workspace views">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-current={view === id ? "page" : undefined} onClick={() => onView(id)}
            className={`flex h-[34px] items-center gap-[10px] rounded-[10px] px-[10px] text-left text-[12px] font-semibold transition-colors ${view === id ? "bg-ob-navy text-white" : "text-ob-slate hover:bg-ob-mist hover:text-ob-navy"}`}>
            <Icon className="size-[15px] shrink-0" strokeWidth={1.8} />{label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
