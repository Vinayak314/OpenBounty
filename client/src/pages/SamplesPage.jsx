import ButtonStates from "@/components/samples/ButtonStates";
import ScrollReveal from "@/components/samples/ScrollReveal";
import PayoutSuccessCard from "@/components/samples/PayoutSuccessCard";
import { SAMPLES } from "@/data/samples";

export default function SamplesPage() {
  return (
    <div className="min-h-screen bg-white px-7 pb-8 pt-7 font-sans leading-[normal] text-ob-navy">
      <div className="w-[1004px]">
        <h1 className="font-serif text-[28px] leading-[1.18] text-ob-navy">{SAMPLES.title}</h1>
        <p className="mt-[10px] text-[11px] text-ob-slate">{SAMPLES.subtitle}</p>
        <div className="mt-[20px] flex items-start gap-[25px]">
          <div className="w-[658px] shrink-0 rounded-[12px] border border-ob-line bg-white p-[22px]">
            <ButtonStates data={SAMPLES.buttonStates} />
            <div className="my-[22px] h-px bg-ob-line" />
            <ScrollReveal data={SAMPLES.scrollReveal} />
          </div>
          <PayoutSuccessCard data={SAMPLES.payoutSuccess} />
        </div>
      </div>
    </div>
  );
}
