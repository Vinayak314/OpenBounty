import { CircleCheck, Sprout, Wallet } from "lucide-react";
import { iconProps } from "@/components/layout/icon";

const ICONS = { wallet: Wallet, "circle-check": CircleCheck, sprout: Sprout };

/** One personal-summary metric card (icon, label, serif value, caption). */
export default function SummaryCard({ stat }) {
  const Icon = ICONS[stat.icon];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-[15px] rounded-xl border border-[#e5e7eb] bg-white p-[18px]">
      <Icon {...iconProps} size={26} className="shrink-0 text-ob-navy" />
      <div className="flex flex-col gap-1.5 whitespace-nowrap leading-[normal]">
        <span className="text-[11px] text-ob-slate">{stat.label}</span>
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-[30px] text-ob-navy">{stat.value}</span>
          <span className="text-[10px] text-ob-slate">{stat.caption}</span>
        </div>
      </div>
    </div>
  );
}
