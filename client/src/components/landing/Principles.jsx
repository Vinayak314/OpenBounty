import listChecks from "@/assets/landing/listChecks.svg";
import scanEye from "@/assets/landing/scanEye.svg";
import wallet from "@/assets/landing/wallet.svg";
import { PRINCIPLES, PRINCIPLES_SECTION } from "@/data/landing";

const ICONS = { listChecks, scanEye, wallet };

export default function Principles() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-[15px] text-center">
        <p className="text-[11px] font-semibold tracking-[2px] text-[#2b5fc9]">{PRINCIPLES_SECTION.eyebrow}</p>
        <h2 className="font-serif text-[30px] font-normal tracking-[-1px] text-ob-navy sm:text-[45px] sm:tracking-[-1.2px]">
          {PRINCIPLES_SECTION.headingPrefix}
          <span className="text-[#5b8dd9]">{PRINCIPLES_SECTION.headingAccent}</span>
        </h2>
      </div>
      <div className="grid gap-[22px] md:grid-cols-3">
        {PRINCIPLES.map((p) => (
          <article key={p.id} className="flex flex-col items-start gap-[22px] rounded-3xl bg-white p-7">
            <div className="flex w-full items-center justify-between">
              <img alt="" src={ICONS[p.icon]} className="size-[29px]" />
              <span className="font-serif text-[29px] italic text-[#5b8dd9]">{p.number}</span>
            </div>
            <h3 className="font-serif text-[28px] font-normal leading-[1.2] text-ob-navy">{p.title}</h3>
            <p className="text-[13px] leading-[1.75] text-[#6b7a99]">{p.description}</p>
            <span className="rounded-full bg-[#dde4f0] px-[9px] py-[5px] text-[10px] font-semibold text-ob-navy">
              {p.tag}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}
