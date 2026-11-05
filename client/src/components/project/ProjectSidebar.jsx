import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Flower2 } from "lucide-react";
import { CHANNEL } from "@/data/project";

const label = "text-[10px] font-semibold uppercase tracking-[1.5px] text-ob-slate";

export default function ProjectSidebar({ project }) {
  return (
    <aside className="flex w-[238px] shrink-0 flex-col overflow-y-auto border-r border-ob-line bg-[#f8fafc] px-5 pb-[30px] pt-[26px]">
      <Link to="/" className="flex items-center gap-[10px]">
        <span className="flex size-[34px] items-center justify-center rounded-full bg-ob-mist"><Flower2 className="size-[20px] text-ob-navy" strokeWidth={1.6} /></span>
        <span className="font-serif text-[25px] font-bold tracking-[-0.8px] text-ob-navy">OpenBounty</span>
      </Link>
      <Link to="/dashboard" className="mt-[22px] flex items-center gap-1 text-[11px] font-medium text-ob-slate"><ArrowLeft className="size-3" /> Dashboard</Link>
      <h2 title={project?.name} className="mt-[28px] break-words font-serif text-[28px] leading-[1.1] text-ob-navy">{project?.name || "Project"}</h2>
      {project?.repository?.url && <a href={project.repository.url} target="_blank" rel="noreferrer" className="mt-[10px] flex min-w-0 items-center gap-1 text-[11px] text-ob-slate"><span className="truncate">{project.repository.fullName}</span><ArrowUpRight className="size-3 shrink-0" /></a>}
      <nav className="mt-[26px]">
        <a href="#general" className="flex h-[34px] items-center gap-[10px] rounded-[10px] bg-ob-mist px-[10px] text-[12px] font-semibold text-ob-navy"># {CHANNEL.name}</a>
      </nav>
      <section className="mt-8 border-t border-ob-line pt-5">
        <h3 className={label}>About this project</h3>
        <p className="mt-3 break-words text-[12px] leading-5 text-ob-slate">{project?.description || "No project description has been added."}</p>
      </section>
    </aside>
  );
}
