import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Flower2, Sparkles } from "lucide-react";
import { PROJECT, CHANNELS, BOUNTY_THREADS } from "@/data/project";

const label = "text-[10px] font-semibold uppercase tracking-[1.5px] text-ob-slate";

export default function ProjectSidebar() {
  return (
    <aside className="flex w-[238px] shrink-0 flex-col overflow-y-auto border-r border-ob-line bg-[#f8fafc] px-5 pb-[46px] pt-[26px]">
      <Link to="/" className="flex items-center gap-[10px]">
        <span className="flex size-[34px] items-center justify-center rounded-full bg-ob-mist"><Flower2 className="size-[20px] text-ob-navy" strokeWidth={1.6} /></span>
        <span className="font-serif text-[25px] font-bold tracking-[-0.8px] text-ob-navy">OpenBounty</span>
      </Link>
      <Link to={PROJECT.dashboardHref} className="mt-[22px] flex items-center gap-1 text-[11px] font-medium text-ob-slate"><ArrowLeft className="size-3" /> Dashboard</Link>
      <h2 className="mt-[28px] font-serif text-[32px] leading-[1.1] text-ob-navy">{PROJECT.name}</h2>
      <a href={PROJECT.repoUrl} className="mt-[10px] flex items-center gap-1 text-[11px] text-ob-slate">{PROJECT.repo} <ArrowUpRight className="size-3" /></a>
      <nav className="mt-[26px]">
        {CHANNELS.map((channel) => <a key={channel.id} href={`#${channel.id}`} className={`flex h-[34px] items-center gap-[10px] rounded-[10px] px-[10px] text-[12px] font-semibold text-ob-navy ${channel.active ? "bg-ob-mist" : ""}`}># {channel.name}<span className="text-[11px] font-normal text-ob-slate">{channel.unread}</span></a>)}
      </nav>
      <div className="mt-[14px] flex items-center justify-between pl-[10px] pr-[22px]"><Sparkles className="size-[18px] text-ob-line" strokeWidth={1.5} /><span className="rounded-full bg-ob-mist px-[10px] py-[5px] text-[10px] font-semibold text-ob-navy">AI</span></div>
      <div className="mt-[28px] flex items-center justify-between"><h3 className={label}>Bounty threads</h3><span className="text-[10px] text-ob-slate">{BOUNTY_THREADS.length}</span></div>
      <ul className="mt-[10px] flex flex-col gap-3">
        {BOUNTY_THREADS.map((thread) => <li key={thread.id}><a href={`#thread-${thread.id}`} className={`flex h-12 flex-col justify-center gap-[3px] rounded-[10px] px-[10px] text-white ${thread.active ? "bg-[#0f2a5e]" : "bg-ob-navy"}`}><span className="text-[11px] font-medium">{thread.title}</span><span className="text-[9px] text-white/60">{thread.subtitle}</span></a></li>)}
      </ul>
      <p className="mt-auto pt-6 text-[10px] text-ob-slate">{PROJECT.footnote}</p>
    </aside>
  );
}
