import { ArrowUp, Paperclip, Plus } from "lucide-react";
import { CHANNEL } from "@/data/project";

export default function Composer() {
  return (
    <>
      <div className="rounded-[14px] border border-ob-line bg-white px-[14px] pb-[10px] pt-[14px]">
        <p className="text-[12px] text-ob-slate">{CHANNEL.composerPlaceholder}</p>
        <div className="mt-[18px] flex items-center justify-between">
          <div className="flex items-center gap-3 text-ob-slate">
            <Plus className="size-4" strokeWidth={1.6} />
            <Paperclip className="size-4" strokeWidth={1.6} />
            <span className="text-[10px]">{CHANNEL.composerHint}</span>
          </div>
          <button type="button" className="flex h-8 w-[74px] items-center justify-center gap-[6px] rounded-[8px] bg-ob-navy text-[11px] font-semibold text-white">
            <ArrowUp className="size-[14px]" strokeWidth={2} /> Send
          </button>
        </div>
      </div>
      <p className="mt-6 text-[10px] text-ob-slate">{CHANNEL.visibility}</p>
    </>
  );
}
