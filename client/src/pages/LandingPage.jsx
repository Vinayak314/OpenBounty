import Navigation from "@/components/landing/Navigation";
import Hero from "@/components/landing/Hero";
import HowItWorksPoster from "@/components/landing/HowItWorksPoster";
import SharedSpace from "@/components/landing/SharedSpace";
import Principles from "@/components/landing/Principles";
import CommunityStory from "@/components/landing/CommunityStory";
import JoinCommunity from "@/components/landing/JoinCommunity";

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f2ede4] font-sans leading-[normal]">
      <Navigation />
      <main>
        <Hero />
        <HowItWorksPoster />
        <div className="flex flex-col gap-20 px-5 pb-[70px] pt-8 sm:px-10 lg:px-[88px]">
          <SharedSpace />
          <Principles />
          <CommunityStory />
        </div>
      </main>
      <JoinCommunity />
    </div>
  );
}
