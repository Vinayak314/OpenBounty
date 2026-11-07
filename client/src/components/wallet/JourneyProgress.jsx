export default function JourneyProgress({ steps }) {
  return (
    <ol className="flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4">
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-center gap-2 sm:gap-4">
          {i > 0 && <span aria-hidden="true" className="text-[12px] text-ob-slate">—</span>}
          {step.status === "complete" ? (
            <span className="rounded-full bg-ob-line px-[9px] py-[5px] text-[10px] font-semibold text-ob-navy">
              ✓ {step.label}
            </span>
          ) : (
            <span
              aria-current={step.status === "current" ? "step" : undefined}
              className={
                step.status === "current"
                  ? "whitespace-pre text-[12px] font-semibold text-ob-navy"
                  : "whitespace-pre text-[12px] text-ob-slate"
              }
            >
              {`${step.index}  ${step.label}`}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
