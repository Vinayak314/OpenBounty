import { ExternalLink, ShieldCheck } from "lucide-react";

const tones = {
  neutral: "bg-ob-mist text-ob-navy",
  warning: "bg-[#fae5d6] text-[#da7038]",
  good: "bg-emerald-100 text-emerald-800",
};

const verdictTones = {
  ready_for_approval: "bg-emerald-100 text-emerald-800",
  changes_requested: "bg-[#fae5d6] text-[#da7038]",
  needs_maintainer: "bg-amber-100 text-amber-900",
};

const ciTones = { success: "text-emerald-700", failure: "text-[#da7038]", pending: "text-amber-700", none: "text-ob-slate" };
const ciLabels = { success: "CI passed", failure: "CI failing", pending: "CI running", none: "No CI results" };

export default function EvidenceReport({ report }) {
  const badge = report.stale ? "bg-ob-line text-ob-slate" : verdictTones[report.verdict] || "bg-ob-mist text-ob-navy";
  return (
    <div className={`rounded-[14px] border border-ob-line bg-[#f8fafc] p-4 ${report.stale ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-[24px] leading-tight text-ob-navy">{report.title}</h3>
          <p className="mt-[6px] break-words text-[11px] text-ob-slate">
            {report.subtitle}
            {report.prUrl && (
              <a href={report.prUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-sky-700 underline">
                open <ExternalLink className="size-3" />
              </a>
            )}
          </p>
        </div>
        <span className={`mt-[6px] shrink-0 rounded-full px-[10px] py-[5px] text-[10px] font-semibold ${badge}`}>
          {report.status}
        </span>
      </div>

      {report.summary && <p className="mt-3 text-[12px] leading-5 text-ob-navy">{report.summary}</p>}

      {report.rows.length > 0 && (
        <div className="mt-[14px] overflow-x-auto rounded-[10px] border border-ob-line bg-white text-[12px] text-ob-navy">
          <div className="grid min-w-[520px] grid-cols-[minmax(120px,1fr)_130px_minmax(160px,1.6fr)] items-center bg-[#f8fafc] px-[10px] py-[9px] font-semibold">
            {report.columns.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          {report.rows.map((row) => (
            <div key={row.id} className="grid min-w-[520px] grid-cols-[minmax(120px,1fr)_130px_minmax(160px,1.6fr)] items-start gap-y-1 border-t border-ob-line px-[10px] py-[10px] leading-[18px]">
              <span className="pr-4">{row.criterion}</span>
              <span>
                <span className={`inline-block rounded-full px-[9px] py-[4px] text-[10px] font-semibold leading-[12px] ${tones[row.assessment.tone] || tones.neutral}`}>
                  {row.assessment.label}
                </span>
              </span>
              <span className="min-w-0">
                {row.evidence.map((line, i) => (
                  <span key={i} className={`block break-words ${i > 0 ? "font-mono text-[11px] text-ob-slate" : ""}`}>{line}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {report.ci && (
        <p className={`mt-3 text-[11px] font-semibold ${ciTones[report.ci.state] || ciTones.none}`}>
          {ciLabels[report.ci.state] || ciLabels.none}
          {report.ci.runs.length > 0 && (
            <span className="font-normal text-ob-slate"> · {report.ci.runs.map((r) => `${r.name}: ${r.conclusion || "?"}`).join(", ")}</span>
          )}
        </p>
      )}

      {report.risks?.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] text-ob-navy">
          {report.risks.map((risk, i) => <li key={i}>{risk}</li>)}
        </ul>
      )}
      {report.uncertainty && <p className="mt-2 text-[11px] italic text-ob-slate">Uncertainty: {report.uncertainty}</p>}

      <p className="mt-[14px] text-[11px] text-ob-slate">{report.next}</p>
      <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-ob-navy">
        <ShieldCheck className="size-4" strokeWidth={1.8} /> {report.policy}
      </p>
      <p className="mt-[14px] break-all text-[10px] text-ob-slate">
        {[report.requestId, report.model, report.reportHash && `report ${report.reportHash}`].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
