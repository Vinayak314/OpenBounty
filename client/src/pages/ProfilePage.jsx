import AppHeader from "@/components/layout/AppHeader";
import AppSidebar from "@/components/layout/AppSidebar";
import ContributionActivity from "@/components/profile/ContributionActivity";
import ImpactStats from "@/components/profile/ImpactStats";
import ProfileHeaderCard from "@/components/profile/ProfileHeaderCard";
import ProjectEarnings from "@/components/profile/ProjectEarnings";
import RecentBounties from "@/components/profile/RecentBounties";
import {
  profile,
  profileFootnote,
  projectEarnings,
  recentBounties,
} from "@/data/profile";
import { useEffect, useState } from "react";
import { GithubAuthProvider, getAdditionalUserInfo, reauthenticateWithPopup } from "firebase/auth";
import { auth } from "../../firebase/firebase";
import { useAuth } from "@/auth/AuthContext";
import { apiRequest } from "@/lib/api";
import { useGithubProfile } from "@/hooks/useGithubProfile";

export default function ProfilePage() {
  const { name, handle, photoURL, githubUrl, githubUsername } = useAuth();
  const { profile: githubProfileData, activity, loading, error, activityError } = useGithubProfile(githubUsername);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");
  const [linkedWallet, setLinkedWallet] = useState(null);
  useEffect(() => {
    let active = true;
    apiRequest("/me")
      .then(({ user }) => { if (active) setLinkedWallet(user.wallet); })
      .catch(() => {})
      .finally(() => { active = false; });
    return () => { active = false; };
  }, []);
  const accountName = githubProfileData?.name || name;
  const githubProfile = {
    ...profile,
    name: accountName,
    handle: githubUsername ? `@${githubUsername}` : handle,
    avatarUrl: githubProfileData?.avatar_url || photoURL,
    githubUrl: githubProfileData?.html_url || githubUrl,
    bio: githubProfileData?.bio || "No public GitHub bio set.",
    wallet: linkedWallet ? {
      ...profile.wallet,
      address: `${linkedWallet.address.slice(0, 6)}…${linkedWallet.address.slice(-4)}`,
      fullAddress: linkedWallet.address,
      provider: "MetaMask · Base connected",
    } : profile.wallet,
  };
  const stats = [
    { id: "repos", label: "Public repositories", value: githubProfileData?.public_repos ?? "—", caption: "Public GitHub repositories" },
    { id: "followers", label: "Followers", value: githubProfileData?.followers ?? "—", caption: "GitHub followers" },
    { id: "following", label: "Following", value: githubProfileData?.following ?? "—", caption: "GitHub accounts followed" },
    { id: "since", label: "GitHub since", value: githubProfileData?.created_at ? new Date(githubProfileData.created_at).getFullYear() : "—", caption: "Account creation year" },
  ];
  async function reconnectGitHub() {
    setReconnectError("");
    setReconnecting(true);
    try {
      const result = await reauthenticateWithPopup(auth.currentUser, new GithubAuthProvider());
      const info = getAdditionalUserInfo(result);
      const username = info?.username || info?.profile?.login;
      if (username) {
        localStorage.setItem(`github-username:${result.user.uid}`, username);
        window.dispatchEvent(new Event("github-identity-updated"));
        try {
          await apiRequest("/me/github", { method: "PUT", body: { username } });
        } catch (syncError) {
          console.warn("Could not save the GitHub profile to OpenBounty yet:", syncError.message);
        }
      } else {
        setReconnectError("GitHub did not return a username. Check the OAuth app configuration, then try again.");
      }
    } catch (signInError) {
      if (signInError.code !== "auth/popup-closed-by-user") {
        setReconnectError("Could not reconnect to GitHub. Please try again.");
      }
    } finally {
      setReconnecting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans text-ob-navy">
      <AppSidebar active="profile" />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader crumbs={["Workspace", "Profile"]} variant="compact" />
        <main className="flex min-w-0 flex-col gap-7 px-4 pb-10 pt-6 sm:px-8 sm:pt-9">
          <ProfileHeaderCard profile={githubProfile} />
          {!githubUsername && (
            <section className="flex flex-col gap-2 rounded-xl border border-ob-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ob-slate">Reconnect GitHub to load your public profile stats and recent activity.</p>
              <button type="button" onClick={reconnectGitHub} disabled={reconnecting} className="shrink-0 rounded-lg bg-ob-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
                {reconnecting ? "Connecting…" : "Reconnect GitHub"}
              </button>
              {reconnectError && <p role="alert" className="text-xs text-red-700">{reconnectError}</p>}
            </section>
          )}
          {error && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error} Public GitHub stats may be temporarily unavailable.</p>}
          <ImpactStats stats={stats} loading={loading} />
          {activity ? <ContributionActivity activity={activity} /> : (
            <section className="rounded-xl border border-ob-line bg-white p-6 text-sm text-ob-slate">
              {loading ? "Loading your full-year GitHub contribution calendar…" : activityError || "GitHub contributions are unavailable until your GitHub username is available."}
            </section>
          )}
          <div className="flex flex-col items-stretch gap-4 xl:flex-row xl:items-start">
            <RecentBounties data={{ ...recentBounties, items: [] }} />
            <ProjectEarnings data={{ ...projectEarnings, items: [] }} />
          </div>
          <p className="text-[10px] leading-[normal] text-[#94a3b8]">
            {loading ? "Loading public data from GitHub…" : profileFootnote}
          </p>
        </main>
      </div>
    </div>
  );
}
