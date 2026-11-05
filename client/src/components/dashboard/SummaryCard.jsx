import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CircleCheck, Sprout, Wallet } from "lucide-react";
import { iconProps } from "@/components/layout/icon";

const ICONS = { wallet: Wallet, "circle-check": CircleCheck, sprout: Sprout };

/** Counts up to a numeric string like "1,840" once on mount. */
function useCountUp(text) {
  const target = Number(String(text).replace(/,/g, ""));
  const numeric = Number.isFinite(target);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!numeric) return;
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start) / 900, 1);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, numeric]);
  return numeric ? n.toLocaleString("en-US") : text;
}

/** One personal-summary metric card. The whole tile is a link (`stat.href`). */
export default function SummaryCard({ stat }) {
  const Icon = ICONS[stat.icon];
  const value = useCountUp(stat.value);
  const cls =
    "group relative flex min-w-0 flex-1 items-center gap-[15px] rounded-xl border border-[#e5e7eb] bg-white p-[18px] outline-none transition-all duration-200 hover:-translate-y-1 hover:border-ob-navy/30 hover:shadow-[0_10px_30px_-12px_rgba(7,27,62,0.25)] focus-visible:ring-2 focus-visible:ring-ob-navy/40 active:translate-y-0 active:scale-[0.99]";
  const inner = (
    <>
      <Icon {...iconProps} size={26} className="shrink-0 text-ob-navy transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" />
      <div className="flex flex-col gap-1.5 whitespace-nowrap leading-[normal]">
        <span className="text-[11px] text-ob-slate">{stat.label}</span>
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-[30px] tabular-nums text-ob-navy">{value}</span>
          <span className="text-[10px] text-ob-slate">{stat.caption}</span>
        </div>
      </div>
      <ArrowUpRight {...iconProps} size={16} className="absolute right-3 top-3 -translate-x-1 translate-y-1 text-ob-slate opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
    </>
  );
  if (stat.href?.startsWith("#")) {
    return (
      <a
        href={stat.href}
        className={cls}
        onClick={(e) => {
          e.preventDefault();
          document.querySelector(stat.href)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        {inner}
      </a>
    );
  }
  return <Link to={stat.href ?? "/profile"} className={cls}>{inner}</Link>;
}
