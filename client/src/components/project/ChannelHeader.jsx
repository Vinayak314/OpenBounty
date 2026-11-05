import { Ellipsis, Search } from "lucide-react";
import { CHANNEL, PROJECT } from "@/data/project";

export default function ChannelHeader() {
  return (
    <header className="flex h-[78px] items-center justify-between border-b border-ob-line px-6">
      <div>
        <h1 className="font-serif text-[26px] leading-none text-ob-navy"># {CHANNEL.name}</h1>
        <p className="mt-[7px] text-[10px] text-ob-slate">{CHANNEL.project}</p>
      </div>
      <div className="flex items-center gap-4 text-ob-navy">
        <span className="rounded-full bg-ob-mist px-[10px] py-[5px] text-[10px] font-semibold">
          {PROJECT.memberCount} members
        </span>
        <Search className="size-[18px]" strokeWidth={1.8} />
        <Ellipsis className="size-[18px]" strokeWidth={1.8} />
      </div>
    </header>
  );
}
