import AppHeader from "@/components/layout/AppHeader";
import AppSidebar from "@/components/layout/AppSidebar";
import ContributionActivity from "@/components/profile/ContributionActivity";
import ImpactStats from "@/components/profile/ImpactStats";
import ProfileHeaderCard from "@/components/profile/ProfileHeaderCard";
import ProjectEarnings from "@/components/profile/ProjectEarnings";
import RecentBounties from "@/components/profile/RecentBounties";
import {
  contributionActivity,
  profile,
  profileFootnote,
  profileStats,
  projectEarnings,
  recentBounties,
} from "@/data/profile";

// Static design: every value below comes from src/data/profile.js.
export default function ProfilePage() {
  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans text-ob-navy">
      <AppSidebar active="profile" variant="compact" />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader crumbs={["Workspace", "Profile"]} variant="compact" />
        <main className="flex flex-col gap-7 px-8 pb-10 pt-9">
          <ProfileHeaderCard profile={profile} />
          <ImpactStats stats={profileStats} />
          <ContributionActivity activity={contributionActivity} />
          <div className="flex items-start gap-4">
            <RecentBounties data={recentBounties} />
            <ProjectEarnings data={projectEarnings} />
          </div>
          <p className="whitespace-nowrap text-[10px] leading-[normal] text-[#94a3b8]">
            {profileFootnote}
          </p>
        </main>
      </div>
    </div>
  );
}
