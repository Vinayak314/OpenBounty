import { Link } from "react-router-dom";
import github from "@/assets/landing/github.svg";

// Static navigation only: no auth is wired up yet.
export default function ConnectGithubButton({ label, large = false }) {
  return (
    <Link
      to="/connect"
      className={`inline-flex h-[46px] items-center justify-center gap-2 rounded-lg bg-ob-navy px-5 text-sm font-semibold text-[#fffcf5] ${
        large
          ? "border-2 border-[#eec84b] shadow-[0_8px_18px_rgba(7,27,62,0.15)]"
          : "border border-ob-navy"
      }`}
    >
      <img alt="" src={github} className="size-[18px]" />
      {label}
    </Link>
  );
}
