import Layer from "./Layer";
import sun from "@/assets/landing/garden/sun.svg";
import gardenTree from "@/assets/landing/garden/gardenTree.svg";
import gardenTree1 from "@/assets/landing/garden/gardenTree1.svg";
import gate from "@/assets/landing/garden/gate.svg";
import leftDeer from "@/assets/landing/garden/leftDeer.svg";
import rightDeer from "@/assets/landing/garden/rightDeer.svg";
import gardenVines from "@/assets/landing/garden/gardenVines.svg";
import lotus from "@/assets/landing/garden/lotus.svg";
import lotus1 from "@/assets/landing/garden/lotus1.svg";
import lotus2 from "@/assets/landing/garden/lotus2.svg";
import marigold from "@/assets/landing/garden/marigold.svg";
import marigold1 from "@/assets/landing/garden/marigold1.svg";
import marigold2 from "@/assets/landing/garden/marigold2.svg";
import marigold3 from "@/assets/landing/garden/marigold3.svg";
import marigold4 from "@/assets/landing/garden/marigold4.svg";
import marigold5 from "@/assets/landing/garden/marigold5.svg";
import marigold6 from "@/assets/landing/garden/marigold6.svg";
import marigold7 from "@/assets/landing/garden/marigold7.svg";
import marigold8 from "@/assets/landing/garden/marigold8.svg";
import bird from "@/assets/landing/garden/bird.svg";
import bird1 from "@/assets/landing/garden/bird1.svg";
import bird2 from "@/assets/landing/garden/bird2.svg";
import bird3 from "@/assets/landing/garden/bird3.svg";
import bottomBorderStems from "@/assets/landing/garden/bottomBorderStems.svg";

const LOTUS_PAD = "-1.46% -0.74% -0.83% -0.74%";
const MARIGOLD_PAD = "-1.11% -1.1%";
const BIRD_PAD = "-4.17% 0 -0.37% -1.23%";

// Static folk-art scene. Layout values come straight from the Figma frame
// "Garden of open collaboration" (1440 x 365); everything is percentage based
// so it scales with its container.
const BLOSSOMS = [
  { src: lotus, inset: "56.3% 94.24% 32.92% 2.15%", pad: LOTUS_PAD },
  { src: lotus, inset: "56.3% 2.15% 32.92% 94.24%", pad: LOTUS_PAD },
  { src: lotus1, inset: "55.34% 79.31% 31.4% 16.25%", pad: LOTUS_PAD },
  { src: lotus1, inset: "55.34% 16.25% 31.4% 79.31%", pad: LOTUS_PAD },
  { src: lotus2, inset: "63.01% 47.5% 22.07% 47.5%", pad: LOTUS_PAD },
  { src: marigold, inset: "69.43% 92.08% 24.5% 6.37%", pad: MARIGOLD_PAD },
  { src: marigold1, inset: "69.43% 6.39% 24.5% 92.06%", pad: MARIGOLD_PAD },
  { src: marigold2, inset: "66.08% 78.45% 28.29% 20.11%", pad: MARIGOLD_PAD },
  { src: marigold3, inset: "66.08% 20.12% 28.29% 78.44%", pad: MARIGOLD_PAD },
  { src: marigold4, inset: "68.4% 59.39% 25.1% 38.95%", pad: MARIGOLD_PAD },
  { src: marigold4, inset: "68.4% 38.97% 25.1% 59.37%", pad: MARIGOLD_PAD },
];

const BORDER_MARIGOLDS = Array.from({ length: 20 }, (_, k) => ({
  src: k === 0 ? marigold5 : k === 1 ? marigold6 : k < 4 ? marigold7 : marigold8,
  inset: `89.01% ${(96.4 - 5 * k).toFixed(2)}% 2.32% ${(1.38 + 5 * k).toFixed(2)}%`,
}));

function RotatedBird({ src, inset, wrapClass }) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{ inset, containerType: "size" }}
    >
      <div className={`flex-none ${wrapClass}`}>
        <div className="relative size-full">
          <div className="absolute" style={{ inset: BIRD_PAD }}>
            <img alt="" draggable={false} src={src} className="block max-w-none size-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GardenIllustration() {
  return (
    <div className="relative w-full overflow-hidden" aria-hidden="true">
      <div className="relative left-1/2 aspect-[1440/365] w-full min-w-[760px] -translate-x-1/2">
        <Layer src={sun} inset="6.58% 46.88% 70.14% 46.88%" pad="-0.94% -0.89%" />
        <Layer src={gardenTree} inset="14.66% 80.74% 13.97% 2.12%" />
        <Layer src={gardenTree1} inset="14.66% 2.12% 13.97% 80.74%" flip />
        <Layer src={gate} inset="29.86% 41.32% 13.42% 41.32%" pad="-0.31% 0 0 0" />
        <Layer src={leftDeer} inset="20.55% 60.76% 15.62% 24.1%" pad="-0.43% -0.28% -0.3% -0.28%" />
        <Layer src={rightDeer} inset="20.55% 24.1% 15.62% 60.76%" pad="-0.43% -0.28% -0.3% -0.28%" flip />
        <Layer src={gardenVines} inset="61.92% 1.44% 13.42% 1.44%" pad="-1.11% 0" />
        {BLOSSOMS.map((b, i) => (
          <Layer key={i} {...b} />
        ))}
        <RotatedBird
          src={bird}
          inset="31.01% 77.94% 55.23% 16.94%"
          wrapClass="-rotate-[10deg] h-[hypot(9.1841cqw,76.4852cqh)] w-[hypot(90.8159cqw,-23.5148cqh)]"
        />
        <RotatedBird
          src={bird1}
          inset="31.01% 16.94% 55.23% 77.94%"
          wrapClass="-scale-x-100 rotate-[10deg] h-[hypot(-9.1841cqw,76.4853cqh)] w-[hypot(-90.8159cqw,-23.5147cqh)]"
        />
        <RotatedBird src={bird2} inset="27.05% 56.96% 64.93% 39.5%" wrapClass="h-[100cqh] w-[100cqw]" />
        <RotatedBird src={bird3} inset="27.05% 39.5% 64.93% 56.96%" wrapClass="-scale-x-100 h-[100cqh] w-[100cqw]" />
        <Layer src={bottomBorderStems} inset="90.27% 1.18% 3.97% 1.18%" pad="-3.1% 0" />
        {BORDER_MARIGOLDS.map((b, i) => (
          <Layer key={i} {...b} pad={MARIGOLD_PAD} />
        ))}
      </div>
    </div>
  );
}
