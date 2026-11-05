import { ArrowUpRight } from "lucide-react";

const base =
  "inline-flex h-8 items-center gap-1 rounded-[8px] px-3 text-[11px] font-semibold transition-shadow";
const hoverRing = "ring-2 ring-ob-navy ring-offset-2 ring-offset-white";

// The real `hover:` styles live on the default state; the static "Hover" sample
// applies the same look permanently so the strip shows all three states.
export function ClaimButton({ text, disabled = false, forceHover = false }) {
  if (disabled) {
    return (
      <span className={`${base} bg-ob-mist text-ob-slate`} aria-disabled="true">
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`${base} group bg-ob-navy text-white hover:ring-2 hover:ring-ob-navy hover:ring-offset-2 hover:ring-offset-white ${forceHover ? hoverRing : ""}`}
    >
      {text}
      <ArrowUpRight
        className={`size-3 ${forceHover ? "" : "hidden group-hover:block"}`}
        strokeWidth={2}
      />
    </button>
  );
}

export default function ButtonStates({ data }) {
  return (
    <div>
      <h2 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-ob-slate">{data.title}</h2>
      <div className="mt-6 grid grid-cols-3 gap-0">
        {data.states.map((s) => (
          <div key={s.id} className="flex flex-col gap-3">
            <span className="text-[11px] text-ob-slate">{s.label}</span>
            <div>
              <ClaimButton text={s.text} disabled={s.disabled} forceHover={s.forceHover} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
