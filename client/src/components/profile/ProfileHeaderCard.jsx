import { Copy } from "lucide-react";
import { iconProps } from "@/components/layout/icon";

/** GitHub identity + payout wallet. `profile` matches `profile` in src/data/profile.js. */
export default function ProfileHeaderCard({ profile }) {
  return (
    <section className="flex items-center gap-5 rounded-xl border border-ob-line bg-white p-6">
      <img
        src={profile.avatarUrl}
        alt={`${profile.name} avatar`}
        className="size-[72px] shrink-0 rounded-full object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
        <div className="flex items-center gap-3">
          <h1 className="whitespace-nowrap font-serif text-2xl font-normal text-ob-navy">
            {profile.name}
          </h1>
          {profile.githubConnected && (
            <span className="whitespace-nowrap rounded-full bg-ob-mist px-2 py-[3px] text-[10px] font-semibold text-ob-slate">
              {profile.githubBadgeLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-[#94a3b8]">{profile.handle}</p>
        <p className="text-[13px] leading-[1.5] text-ob-slate">{profile.bio}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 rounded-[10px] border border-ob-line bg-[#f8fafc] px-4 py-[14px] leading-[normal]">
        <p className="whitespace-nowrap text-[9px] font-semibold tracking-[0.5px] text-[#94a3b8]">
          {profile.wallet.label}
        </p>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[13px] font-medium text-ob-navy">
            {profile.wallet.address}
          </span>
          <button type="button" aria-label="Copy wallet address" className="flex text-[#94a3b8]">
            <Copy {...iconProps} size={13} />
          </button>
        </div>
        <p className="whitespace-nowrap text-[10px] text-[#94a3b8]">{profile.wallet.provider}</p>
      </div>
    </section>
  );
}
