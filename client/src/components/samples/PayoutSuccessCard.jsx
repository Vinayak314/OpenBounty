import { Check } from "lucide-react";

export default function PayoutSuccessCard({ data }) {
  return (
    <section className="flex h-[300px] w-[320px] shrink-0 flex-col items-center rounded-[12px] bg-ob-navy px-6 pt-[30px] text-center text-white">
      <span className="flex size-12 items-center justify-center rounded-full bg-white text-ob-navy">
        <Check className="size-6" strokeWidth={1.6} />
      </span>
      <h2 className="mt-[18px] font-serif text-[28px] leading-[1.18]">{data.heading}</h2>
      <p className="mt-[14px] font-serif text-[36px] leading-[1.18]">{data.amount}</p>
      <div className="mt-[18px] text-[11px] leading-[18px] text-white/80">
        {data.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      <p className="mt-[20px] text-[8px] uppercase tracking-[0.5px] text-ob-slate">{data.caption}</p>
    </section>
  );
}
