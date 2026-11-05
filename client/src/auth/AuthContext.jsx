import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [identityVersion, setIdentityVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    const refreshIdentity = () => setIdentityVersion((version) => version + 1);
    window.addEventListener("github-identity-updated", refreshIdentity);
    return () => {
      unsubscribe();
      window.removeEventListener("github-identity-updated", refreshIdentity);
    };
  }, []);

  const value = useMemo(() => {
    if (!user) return { user, loading, name: "", handle: "", initials: "?", photoURL: "" };
    const githubProvider = user.providerData.find((provider) => provider.providerId === "github.com");
    const username = localStorage.getItem(`github-username:${user.uid}`);
    const name = user.displayName || username || "GitHub user";
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "GH";
    return {
      user,
      loading,
      name,
      githubUsername: username || "",
      handle: username ? `@${username}` : user.email || "GitHub account",
      githubUrl: username ? `https://github.com/${encodeURIComponent(username)}` : "",
      initials,
      photoURL: user.photoURL || githubProvider?.photoURL || "",
    };
  }, [user, loading, identityVersion]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
