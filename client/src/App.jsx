import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import ConnectWalletPage from "@/pages/ConnectWalletPage";
import DashboardPage from "@/pages/DashboardPage";
import ProjectPage from "@/pages/ProjectPage";
import ProfilePage from "@/pages/ProfilePage";
import SamplesPage from "@/pages/SamplesPage";
import ReviewDemoPage from "@/pages/ReviewDemoPage";
import { AuthProvider } from "@/auth/AuthContext";
import ProtectedRoute from "@/auth/ProtectedRoute";

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo/0g" element={<ReviewDemoPage />} />
        <Route path="/connect" element={<ProtectedRoute><ConnectWalletPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/project" element={<ProtectedRoute><ProjectPage /></ProtectedRoute>} />
        <Route path="/project/:slug" element={<ProtectedRoute><ProjectPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/samples" element={<ProtectedRoute><SamplesPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
