import { HOW_IT_WORKS_STEPS } from "@/data/landing";

export default function HowItWorksPoster() {
  return (
    <section id="how-it-works" className="px-5 pb-14 pt-3 sm:px-10 lg:px-[72px]">
      <ol className="flex flex-col gap-6 rounded-3xl bg-ob-navy px-6 py-[30px] md:flex-row md:items-center md:justify-between md:gap-4 lg:px-10">
        {HOW_IT_WORKS_STEPS.map((step, index) => (
          <li key={step.id} className="flex items-center gap-[18px]">
            <span className="font-serif text-[34px] italic text-[#f2ede4]">{step.number}</span>
            <div className="flex flex-col gap-2">
              <span className="font-serif text-[25px] leading-[25px] text-[#f2ede4]">{step.title}</span>
              <span className="text-[11px] text-[#d1d5db]">{step.description}</span>
            </div>
            {index < HOW_IT_WORKS_STEPS.length - 1 && (
              <span aria-hidden="true" className="hidden text-[24px] text-[#d1d5db] md:inline">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
