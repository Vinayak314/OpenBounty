import Layer from "./Layer";
import treeFramework from "@/assets/landing/tree/treeFramework.svg";
import leafStems from "@/assets/landing/tree/leafStems.svg";
import crownLeaves from "@/assets/landing/tree/crownLeaves.svg";
import outerLeaves from "@/assets/landing/tree/outerLeaves.svg";
import leftBird from "@/assets/landing/tree/leftBird.svg";
import rightBird from "@/assets/landing/tree/rightBird.svg";
import leftMarigold from "@/assets/landing/tree/leftMarigold.svg";
import rightMarigold from "@/assets/landing/tree/rightMarigold.svg";
import intertwinedRoots from "@/assets/landing/tree/intertwinedRoots.svg";
import trunkInk from "@/assets/landing/tree/trunkInk.svg";

const BIRD_PAD = "-1.79% -1.53% -1.31% -1.53%";
const MARIGOLD_PAD = "-1.96% -1.86% -1.96% -1.96%";

// Folk-art tree (Figma "Community tree", 260 x 230).
export default function CommunityTree({ className = "" }) {
  return (
    <div
      className={`relative h-[230px] w-[260px] shrink-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <Layer src={treeFramework} inset="20.87% 15.93% 18.26% 15.93%" pad="-4.64% -3.66%" />
      <Layer src={leafStems} inset="13.91% 15% 31.3% 15%" pad="-0.79% -0.55%" />
      <Layer src={crownLeaves} inset="6.52% 21.78% 57.09% 21.78%" pad="-1.15% -0.51% -0.9% -0.51%" />
      <Layer src={outerLeaves} inset="33.45% 8.08% 19.57% 8.08%" pad="-0.69% -0.34% -0.93% -0.34%" />
      <Layer src={leftBird} inset="30% 67.69% 51.74% 13.46%" pad={BIRD_PAD} />
      <Layer src={rightBird} inset="30% 13.46% 51.74% 67.69%" pad={BIRD_PAD} />
      <Layer src={leftMarigold} inset="17.72% 77.69% 67.84% 9.51%" pad={MARIGOLD_PAD} />
      <Layer src={rightMarigold} inset="17.72% 9.23% 67.84% 77.97%" pad={MARIGOLD_PAD} />
      <Layer src={intertwinedRoots} inset="78.7% 26.92% 5.65% 26.92%" pad="-9.72% -2.92% -2.78% -2.92%" />
      <Layer src={trunkInk} inset="52.87% 47.64% 22.17% 46.87%" pad="0 -4.21% -1.4% -4.21%" />
    </div>
  );
}
