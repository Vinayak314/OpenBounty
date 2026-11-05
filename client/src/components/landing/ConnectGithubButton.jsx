import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GithubAuthProvider, getAdditionalUserInfo, signInWithPopup } from "firebase/auth";
import github from "@/assets/landing/github.svg";
import { auth } from "../../../firebase/firebase";

export default function ConnectGithubButton({ label, large = false }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, new GithubAuthProvider());
      const githubInfo = getAdditionalUserInfo(result);
      const username = githubInfo?.username || githubInfo?.profile?.login;
      if (username) {
        localStorage.setItem(`github-username:${result.user.uid}`, username);
        window.dispatchEvent(new Event("github-identity-updated"));
      }
      navigate("/connect");
    } catch (err) {
      setError(err.code === "auth/popup-closed-by-user"
        ? "Sign-in was cancelled. Try again when you're ready."
        : "Could not sign in with GitHub. Please try again.");
      console.error("GitHub sign-in failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={loading}
        className={`inline-flex h-[46px] items-center justify-center gap-2 rounded-lg bg-ob-navy px-5 text-sm font-semibold text-[#fffcf5] ${
          large
            ? "border-2 border-[#eec84b] shadow-[0_8px_18px_rgba(7,27,62,0.15)]"
            : "border border-ob-navy"
        } disabled:cursor-wait disabled:opacity-70`}
      >
        <img alt="" src={github} className="size-[18px]" />
        {loading ? "Connecting…" : label}
      </button>
      {error && <p role="alert" className="max-w-xs text-center text-xs text-red-700">{error}</p>}
    </div>
  );
}
