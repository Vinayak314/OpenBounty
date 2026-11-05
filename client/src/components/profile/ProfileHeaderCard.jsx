import { useState } from "react";
import { Copy } from "lucide-react";
import { iconProps } from "@/components/layout/icon";
import InitialsAvatar from "@/components/layout/InitialsAvatar";

/** GitHub identity + payout wallet. `profile` matches `profile` in src/data/profile.js. */
export default function ProfileHeaderCard({ profile }) {
  const [copied, setCopied] = useState(false);

  async function copyWallet() {
    if (!profile.wallet.fullAddress) return;
    try {
      await navigator.clipboard.writeText(profile.wallet.fullAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-5 rounded-xl border border-ob-line bg-white p-5 sm:p-6">
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt={`${profile.name} avatar`} className="size-[72px] shrink-0 rounded-full object-cover" />
      ) : (
        <InitialsAvatar initials={profile.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")} className="size-[72px] text-xl" />
      )}
      <div className="flex min-w-[180px] flex-1 flex-col gap-1 leading-[normal]">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-2xl font-normal text-ob-navy">
            {profile.githubUrl ? <a href={profile.githubUrl} target="_blank" rel="noreferrer" className="hover:underline">{profile.name}</a> : profile.name}
          </h1>
          {profile.githubConnected && (
            <span className="whitespace-nowrap rounded-full bg-ob-mist px-2 py-[3px] text-[10px] font-semibold text-ob-slate">
              {profile.githubBadgeLabel}
            </span>
          )}
        </div>
        {profile.githubUrl ? <a href={profile.githubUrl} target="_blank" rel="noreferrer" className="w-fit text-xs text-[#94a3b8] hover:underline">{profile.handle}</a> : <p className="text-xs text-[#94a3b8]">{profile.handle}</p>}
        <p className="text-[13px] leading-[1.5] text-ob-slate">{profile.bio}</p>
      </div>
      <div className="ml-auto flex max-w-full shrink-0 flex-col gap-1.5 rounded-[10px] border border-ob-line bg-[#f8fafc] px-4 py-[14px] leading-[normal]">
        <p className="whitespace-nowrap text-[9px] font-semibold tracking-[0.5px] text-[#94a3b8]">
          {profile.wallet.label}
        </p>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[13px] font-medium text-ob-navy">
            {profile.wallet.address}
          </span>
          <button type="button" aria-label="Copy wallet address" title={copied ? "Copied" : "Copy wallet address"} onClick={copyWallet} disabled={!profile.wallet.fullAddress} className="flex text-[#94a3b8] disabled:cursor-not-allowed disabled:opacity-40">
            {copied ? "Copied" : <Copy {...iconProps} size={13} />}
          </button>
        </div>
        <p className="whitespace-nowrap text-[10px] text-[#94a3b8]">{profile.wallet.provider}</p>
      </div>
    </section>
  );
}
