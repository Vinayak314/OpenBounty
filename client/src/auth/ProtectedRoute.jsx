import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ob-slate">Loading your account…</div>;
  }
  if (!user) return <Navigate to="/" replace state={{ from: location }} />;
  return children;
}
