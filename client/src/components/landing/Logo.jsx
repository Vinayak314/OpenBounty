import flower2 from "@/assets/landing/flower2.svg";
import { BRAND_NAME } from "@/data/landing";

export default function Logo({ dark = false }) {
  return (
    <div className="flex items-center gap-[10px]">
      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#eec84b]">
        <img alt="" src={flower2} className="size-[25px]" />
      </div>
      <span
        className={`font-serif text-[25px] font-bold tracking-[-0.8px] ${
          dark ? "text-[#f2ede4]" : "text-ob-navy"
        }`}
      >
        {BRAND_NAME}
      </span>
    </div>
  );
}
