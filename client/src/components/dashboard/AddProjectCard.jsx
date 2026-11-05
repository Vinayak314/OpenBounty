import { Plus } from "lucide-react";
import { iconProps } from "@/components/layout/icon";

/** Dashed "add a project" tile. Copy comes from dashboardAddProject in src/data/dashboard.js. */
export default function AddProjectCard({ content }) {
  return (
    <div className="flex min-h-[248px] min-w-0 flex-1 flex-col items-center justify-center gap-3 self-stretch rounded-xl border-[1.5px] border-dashed border-[#e5e7eb] bg-white p-5 leading-[normal]">
      <Plus {...iconProps} size={28} className="text-ob-navy" />
      <p className="font-serif text-[25px] text-ob-navy">{content.title}</p>
      <p className="text-xs text-ob-slate">{content.description}</p>
      <button type="button" className="text-xs font-semibold text-ob-navy hover:underline">
        {content.actionLabel}
      </button>
    </div>
  );
}
