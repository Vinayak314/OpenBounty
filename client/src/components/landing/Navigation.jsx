import Logo from "./Logo";
import ConnectGithubButton from "./ConnectGithubButton";
import { NAV_LINKS, HERO } from "@/data/landing";

export default function Navigation() {
  return (
    <header className="flex h-[94px] items-center justify-between px-5 sm:px-10 lg:px-[72px]">
      <Logo />
      <nav className="hidden gap-8 text-[13px] text-ob-navy md:flex">
        {NAV_LINKS.map((link) => (
          <a key={link.id} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <ConnectGithubButton label={HERO.connectLabel} />
    </header>
  );
}
