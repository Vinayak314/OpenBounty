import ProjectSidebar from "@/components/project/ProjectSidebar";
import ChannelHeader from "@/components/project/ChannelHeader";
import ChatThread from "@/components/project/ChatThread";
import Composer from "@/components/project/Composer";
import ProjectRail from "@/components/project/ProjectRail";

export default function ProjectPage() {
  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans leading-[normal] text-ob-navy">
      <ProjectSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelHeader />
        <div className="flex flex-1">
          <main className="min-w-0 flex-1 px-6 pb-8 pt-[22px]">
            <ChatThread />
            <div className="mt-5">
              <Composer />
            </div>
          </main>
          <ProjectRail />
        </div>
      </div>
    </div>
  );
}
