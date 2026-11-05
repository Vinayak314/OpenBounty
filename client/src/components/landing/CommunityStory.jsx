import CommunityTree from "./CommunityTree";
import { COMMUNITY_STORY } from "@/data/landing";

export default function CommunityStory() {
  return (
    <section
      id="community"
      className="flex flex-col items-center gap-[50px] rounded-3xl bg-[#dde4f0] px-6 py-[30px] sm:px-10 md:flex-row"
    >
      <CommunityTree />
      <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
        <p className="text-[11px] font-semibold tracking-[2px] text-[#237e78]">{COMMUNITY_STORY.eyebrow}</p>
        <h2 className="font-serif text-[30px] font-normal leading-[1.2] text-ob-navy sm:text-[38px]">
          {COMMUNITY_STORY.title}
        </h2>
        <p className="text-sm leading-[1.7] text-ob-navy">{COMMUNITY_STORY.body}</p>
        <ul className="flex flex-wrap gap-x-[26px] gap-y-2 text-xs font-semibold text-[#237e78]">
          {COMMUNITY_STORY.values.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
