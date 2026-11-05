import flowerChip from "@/assets/landing/flowerChip.jpg";
import leafChip from "@/assets/landing/leafChip.jpg";
import sparkle from "@/assets/landing/sparkle.svg";
import ConnectGithubButton from "./ConnectGithubButton";
import GardenIllustration from "./GardenIllustration";
import { HERO } from "@/data/landing";

const SHADOW = { textShadow: "0 4px 10px rgba(7,27,62,0.1)" };
const HEADLINE =
  "font-serif text-[40px] leading-[1.08] tracking-[-1.5px] text-ob-navy sm:text-[52px] lg:text-[65px] lg:tracking-[-2.5px]";

function Chip({ src }) {
  return (
    <img
      alt=""
      src={src}
      className="hidden h-[45px] w-[75px] rounded-full object-cover md:block"
    />
  );
}

export default function Hero() {
  return (
    <>
      <section className="flex flex-col items-center gap-[23px] border-x-4 border-[#5b8dd9] px-5 pt-[46px] sm:px-10 lg:px-[100px]">
        <div className="flex items-center gap-3">
          <img alt="" src={sparkle} className="size-[17px]" />
          <p className="text-center text-[11px] font-semibold tracking-[2.2px] text-ob-navy">
            {HERO.eyebrow}
          </p>
          <img alt="" src={sparkle} className="size-[17px]" />
        </div>
        <h1 className="flex flex-col items-center px-6 text-center font-normal">
          <span className={HEADLINE} style={SHADOW}>
            From an issue to a
          </span>
          <span className="flex items-center gap-[18px]">
            <Chip src={flowerChip} />
            <span className={`${HEADLINE} italic text-[#5b8dd9]`} style={SHADOW}>
              funded agreement
            </span>
            <Chip src={leafChip} />
          </span>
          <span className={HEADLINE} style={SHADOW}>
            with <span className="text-[#5b8dd9]">proof</span>.
          </span>
        </h1>
        <p className="text-center text-[17px] text-ob-navy">{HERO.subtitle}</p>
        <ConnectGithubButton label={HERO.connectLabel} large />
        <p
          className="text-[11px] text-[#6b7a99]"
          style={{ textShadow: "0 2px 6px rgba(7,27,62,0.08)" }}
        >
          {HERO.note}
        </p>
      </section>
      <GardenIllustration />
    </>
  );
}
