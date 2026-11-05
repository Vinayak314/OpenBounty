import { ShieldCheck } from "lucide-react";

const tones = {
  neutral: "bg-ob-mist text-ob-navy",
  warning: "bg-[#fae5d6] text-[#da7038]",
};

export default function EvidenceReport({ report }) {
  return (
    <div className="rounded-[14px] border border-ob-line bg-[#f8fafc] p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-serif text-[24px] leading-tight text-ob-navy">{report.title}</h3>
          <p className="mt-[6px] text-[11px] text-ob-slate">{report.subtitle}</p>
        </div>
        <span className="mt-[6px] rounded-full bg-ob-mist px-[10px] py-[5px] text-[10px] font-semibold text-ob-navy">
          {report.status}
        </span>
      </div>

      <div className="mt-[14px] overflow-hidden rounded-[10px] border border-ob-line bg-white text-[12px] text-ob-navy">
        <div className="grid grid-cols-[180px_140px_1fr] items-center bg-[#f8fafc] px-[10px] py-[9px] font-semibold">
          {report.columns.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        {report.rows.map((row) => (
          <div key={row.id} className="grid h-[58px] grid-cols-[180px_140px_1fr] items-center border-t border-ob-line px-[10px] leading-[18px]">
            <span className="pr-4">{row.criterion}</span>
            <span>
              <span className={`inline-block rounded-full px-[9px] py-[4px] text-[10px] font-semibold leading-[12px] ${tones[row.assessment.tone]}`}>
                {row.assessment.label}
              </span>
            </span>
            <span>
              {row.evidence.map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-[14px] text-[11px] text-ob-slate">{report.next}</p>
      <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-ob-navy">
        <ShieldCheck className="size-4" strokeWidth={1.8} /> {report.policy}
      </p>
      <p className="mt-[14px] text-[10px] text-ob-slate">{report.requestId}</p>
    </div>
  );
}
