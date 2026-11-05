import { Plus } from "lucide-react";
import { iconProps } from "@/components/layout/icon";

/** Dashed "add a project" tile; the whole tile is a button that calls onClick. */
export default function AddProjectCard({ content, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[248px] min-w-0 flex-1 flex-col items-center justify-center gap-3 self-stretch rounded-xl border-[1.5px] border-dashed border-[#d1d5db] bg-white p-5 leading-[normal] outline-none transition-all duration-200 hover:-translate-y-1 hover:border-ob-navy hover:bg-ob-mist/40 focus-visible:ring-2 focus-visible:ring-ob-navy/40 active:translate-y-0 active:scale-[0.99]"
    >
      <Plus {...iconProps} size={28} className="text-ob-navy transition-transform duration-300 group-hover:rotate-90 group-hover:scale-125" />
      <p className="font-serif text-[25px] text-ob-navy">{content.title}</p>
      <p className="text-xs text-ob-slate">{content.description}</p>
      <span className="text-xs font-semibold text-ob-navy group-hover:underline">{content.actionLabel}</span>
    </button>
  );
}
