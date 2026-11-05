import Logo from "./Logo";
import Mandala from "./Mandala";
import { FINAL_INVITATION, FOOTER } from "@/data/landing";

export default function JoinCommunity() {
  return (
    <section className="flex flex-col gap-12 bg-ob-navy px-5 pb-[30px] pt-[58px] sm:px-10 lg:px-[88px]">
      <div className="flex items-center justify-between gap-4">
        <Mandala className="hidden md:block" />
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-[22px] text-center">
          <h2 className="font-serif text-[32px] font-normal leading-[1.15] text-[#f2ede4] sm:text-[46px]">
            {FINAL_INVITATION.headingPrefix}
            <span className="text-[#d1d5db]">{FINAL_INVITATION.headingAccent}</span>
          </h2>
          <p className="text-sm text-[#d1d5db]">{FINAL_INVITATION.subtitle}</p>
        </div>
        <Mandala className="hidden md:block" />
      </div>
      <footer className="flex flex-col items-center justify-between gap-4 border-t border-white/20 pt-[30px] md:flex-row">
        <Logo dark />
        <p className="text-[11px] text-[#a3a3a3]">{FOOTER.copyright}</p>
        <nav className="flex gap-6 text-[11px] text-[#f2ede4]">
          {FOOTER.links.map((l) => (
            <a key={l.id} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
      </footer>
    </section>
  );
}
