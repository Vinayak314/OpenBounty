import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProjectSidebar from "@/components/project/ProjectSidebar";
import ChannelHeader from "@/components/project/ChannelHeader";
import ChatThread from "@/components/project/ChatThread";
import Composer from "@/components/project/Composer";
import ProjectRail from "@/components/project/ProjectRail";
import ReviewPanel from "@/components/project/ReviewPanel";
import CriteriaPanel from "@/components/project/CriteriaPanel";
import AgentActivityPanel from "@/components/project/AgentActivityPanel";
import BountyBoard from "@/components/project/BountyBoard";
import { useChat } from "@/hooks/useChat";
import { apiRequest } from "@/lib/api";

export default function ProjectPage() {
  const { slug } = useParams();
  return <ProjectWorkspace key={slug} slug={slug} />;
}

function ProjectWorkspace({ slug }) {
  const [project, setProject] = useState(null);
  const chat = useChat(project?.slug);
  const [loading, setLoading] = useState(Boolean(slug));
  const [projectError, setProjectError] = useState("");
  const [query, setQuery] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState("chat");

  useEffect(() => {
    let active = true;
    if (!slug) {
      setLoading(false);
      setProjectError("Choose a project from your dashboard to open its workspace.");
      return () => { active = false; };
    }
    setLoading(true);
    setProjectError("");
    apiRequest(`/projects/${encodeURIComponent(slug)}`)
      .then((result) => { if (active) setProject(result.project); })
      .catch((error) => { if (active) setProjectError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const reply = (message) => {
    setEditing(null);
    setReplyTo({ id: message.id, author: message.author.name, snippet: (message.body || "Message").slice(0, 90) });
  };

  if (loading || projectError || !project) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-6 font-sans text-ob-navy">
      <div className="max-w-md rounded-2xl border border-ob-line bg-white p-8 text-center shadow-sm">
        <h1 className="font-serif text-2xl">{loading ? "Loading project…" : "Project workspace"}</h1>
        {projectError && <p role="alert" className="mt-3 text-sm text-ob-slate">{projectError}</p>}
        <Link to="/dashboard" className="mt-5 inline-flex rounded-lg bg-ob-navy px-4 py-2 text-sm font-semibold text-white">Back to dashboard</Link>
      </div>
    </main>;
  }

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-[#f8fafc] font-sans leading-[normal] text-ob-navy">
      <ProjectSidebar project={project} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChannelHeader project={project} query={query} onQuery={setQuery} sound={chat.sound} onToggleSound={() => chat.setSound((value) => !value)} connectionStatus={chat.connectionStatus} />
        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <nav className="flex gap-2 border-b border-ob-line bg-white px-6 py-2" aria-label="Workspace views">
              {[["chat", "Chat"], ["bounties", "Bounties"], ["criteria", "Criteria"], ["reviews", "PR reviews"], ["activity", "0G activity"]].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${view === id ? "bg-ob-navy text-white" : "text-ob-slate hover:bg-ob-mist"}`}>
                  {label}
                </button>
              ))}
            </nav>
            {view === "bounties" ? <BountyBoard slug={slug} canMaintain={project.canMaintain} />
              : view === "reviews" ? <ReviewPanel slug={slug} />
              : view === "criteria" ? <CriteriaPanel slug={slug} />
                : view === "activity" ? <AgentActivityPanel slug={slug} /> : <>
            {chat.error && <p role="alert" className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900">{chat.error}</p>}
            <ChatThread
              messages={chat.messages}
              typing={chat.typing}
              loading={chat.loading}
              query={query}
              onReact={chat.react}
              onReply={reply}
              onEdit={(message) => { setReplyTo(null); setEditing(message); }}
              onDelete={chat.remove}
            />
            <Composer
              projectSlug={slug}
              projectName={project.name}
              onSend={async (text, files) => {
                const sent = await chat.send(text, files, replyTo);
                if (sent) setReplyTo((current) => current === replyTo ? null : current);
                return sent;
              }}
              onTyping={chat.typingActivity}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              editing={editing}
              onSaveEdit={async (text) => {
                const saved = await chat.edit(editing.id, text);
                if (saved) setEditing(null);
                return saved;
              }}
              onCancelEdit={() => setEditing(null)}
            />
            </>}
          </main>
          <ProjectRail project={project} />
        </div>
      </div>
    </div>
  );
}
