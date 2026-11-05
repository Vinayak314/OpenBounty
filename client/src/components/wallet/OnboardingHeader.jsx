import { Link } from "react-router-dom";
import flower from "@/assets/wallet/flower.svg";

export default function OnboardingHeader({ helpLink }) {
  return (
    <header className="flex h-[94px] items-center justify-between border-b border-ob-line bg-white px-[72px]">
      <Link to="/" className="flex items-center gap-[10px]">
        <span className="flex size-[34px] items-center justify-center rounded-full bg-ob-navy">
          <img src={flower} alt="" className="size-[25px]" />
        </span>
        <span className="font-serif text-[25px] font-bold tracking-[-0.8px] text-ob-navy">
          OpenBounty
        </span>
      </Link>
      <a href={helpLink.href} className="text-[12px] text-ob-navy">
        {helpLink.label}
      </a>
    </header>
  );
}
