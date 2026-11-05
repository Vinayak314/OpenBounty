import { ArrowUpRight, Github, Hash } from "lucide-react";

export default function ProjectRail({ project }) {
  return (
    <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-ob-line px-[18px] pb-6 pt-[22px]">
      <h2 className="font-serif text-[24px] leading-tight text-ob-navy">Project details</h2>
      <p className="mt-2 break-words text-[12px] leading-5 text-ob-slate">{project?.description || "Your project workspace is ready for discussion."}</p>
      <div className="my-5 h-px bg-ob-line" />
      <div className="flex items-center gap-2 text-[12px] font-semibold text-ob-navy"><Hash className="size-4" /> general</div>
      <p className="mt-2 text-[11px] leading-5 text-ob-slate">Messages in this channel are saved to this project and shared with its owner.</p>
      {project?.repository?.url && <a href={project.repository.url} target="_blank" rel="noreferrer" className="mt-6 flex items-center gap-2 rounded-lg border border-ob-line p-3 text-[11px] font-semibold text-ob-navy hover:bg-ob-mist"><Github className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{project.repository.fullName}</span><ArrowUpRight className="size-3 shrink-0" /></a>}
    </aside>
  );
}
