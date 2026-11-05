import { GitPullRequest, Pin, Sparkles } from "lucide-react";
import Avatar from "./Avatar";
import EvidenceReport from "./EvidenceReport";
import { CHANNEL, MESSAGES } from "@/data/project";

function Byline({ author, time }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-semibold text-ob-navy">{author.name}</span>
      {author.agent && (
        <span className="rounded-full bg-ob-mist px-[10px] py-[5px] text-[10px] font-semibold text-ob-navy">AI</span>
      )}
      <span className="text-[10px] text-ob-slate">{time}</span>
    </div>
  );
}

function Message({ m }) {
  if (m.type === "event") {
    return (
      <div className="flex items-center gap-2 pl-[43px] text-[11px]">
        <GitPullRequest className="size-4 text-ob-navy" strokeWidth={1.8} />
        <span className="font-semibold text-ob-navy">{m.title}</span>
        <span className="text-[10px] text-ob-slate">{m.meta}</span>
      </div>
    );
  }
  const avatar = m.author.agent ? (
    <Avatar size={32}><Sparkles className="size-[18px]" strokeWidth={1.7} /></Avatar>
  ) : (
    <Avatar initials={m.author.initials} color={m.author.color} size={32} />
  );
  return (
    <div className="flex items-start gap-[11px]">
      {avatar}
      <div className="min-w-0 flex-1">
        <Byline author={m.author} time={m.time} />
        {m.type === "report" ? (
          <div className="mt-[9px]"><EvidenceReport report={m.report} /></div>
        ) : (
          <p
            className={`mt-[9px] rounded-[14px] px-3 py-[11px] text-[12px] leading-5 text-ob-navy ${
              m.variant === "outlined" ? "border border-ob-line" : "bg-white"
            }`}
          >
            {m.body}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ChatThread() {
  return (
    <div id="general" className="flex flex-col gap-5">
      <div className="flex h-10 items-center gap-[10px] rounded-[10px] border border-ob-line bg-[#f8fafc] px-[10px] text-[11px] text-ob-navy">
        <Pin className="size-4" strokeWidth={1.8} />
        <span>{CHANNEL.pinned.text}</span>
        <span className="ml-auto font-semibold">{CHANNEL.pinned.action} &rarr;</span>
      </div>
      <p className="text-center text-[10px] text-ob-slate">{CHANNEL.dateLabel}</p>
      {MESSAGES.map((m) => (
        <Message key={m.id} m={m} />
      ))}
    </div>
  );
}
