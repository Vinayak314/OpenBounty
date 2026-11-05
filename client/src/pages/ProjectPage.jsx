import { useState } from "react";
import ProjectSidebar from "@/components/project/ProjectSidebar";
import ChannelHeader from "@/components/project/ChannelHeader";
import ChatThread from "@/components/project/ChatThread";
import Composer from "@/components/project/Composer";
import ProjectRail from "@/components/project/ProjectRail";
import { useChat } from "@/hooks/useChat";

export default function ProjectPage() {
  const chat = useChat();
  const [query, setQuery] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);

  const reply = (m) => {
    setEditing(null);
    setReplyTo({ id: m.id, author: m.author.name, snippet: (m.body || "Evidence report").slice(0, 90) });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] font-sans leading-[normal] text-ob-navy">
      <ProjectSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelHeader
          query={query}
          onQuery={setQuery}
          onReset={chat.reset}
          sound={chat.sound}
          onToggleSound={() => chat.setSound((s) => !s)}
        />
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <ChatThread
              messages={chat.messages}
              typing={chat.typing}
              query={query}
              onReact={chat.react}
              onReply={reply}
              onEdit={(m) => {
                setReplyTo(null);
                setEditing(m);
              }}
              onDelete={chat.remove}
            />
            <Composer
              onSend={(text, files) => {
                chat.send(text, files, replyTo);
                setReplyTo(null);
              }}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              editing={editing}
              onSaveEdit={(text) => {
                chat.edit(editing.id, text);
                setEditing(null);
              }}
              onCancelEdit={() => setEditing(null)}
            />
          </main>
          <ProjectRail />
        </div>
      </div>
    </div>
  );
}
