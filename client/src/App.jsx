import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import ConnectWalletPage from "@/pages/ConnectWalletPage";
import DashboardPage from "@/pages/DashboardPage";
import ProjectPage from "@/pages/ProjectPage";
import ProfilePage from "@/pages/ProfilePage";
import SamplesPage from "@/pages/SamplesPage";

// Static design only — no backend. All data lives in src/data/*.js as placeholders.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/connect" element={<ConnectWalletPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/project" element={<ProjectPage />} />
        <Route path="/project/:slug" element={<ProjectPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/samples" element={<SamplesPage />} />
      </Routes>
    </BrowserRouter>
  );
}
