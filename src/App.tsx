import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import { Login } from "./pages/Login";
import { ChangePassword } from "./pages/ChangePassword";
import { Dashboard } from "./pages/Dashboard";
import { Reports } from "./pages/Reports";
import { Buildings } from "./pages/Buildings";
import { Forum } from "./pages/Forum";
import { ChatbotSettings } from "./pages/ChatbotSettings";
import { Settings } from "./pages/Settings";
import { AdminLayout } from "./components/AdminLayout";
import { WegOwnerLayout } from "./components/WegOwnerLayout";
import { WegOwnerDashboard } from "./pages/weg-owner/Dashboard";
import { WegOwnerReports } from "./pages/weg-owner/Reports";
import { WegOwnerChatbot } from "./pages/weg-owner/Chatbot";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            
            {/* Admin Routes */}
            <Route path="/dashboard" element={<AdminLayout><Dashboard /></AdminLayout>} />
            <Route path="/reports" element={<AdminLayout><Reports /></AdminLayout>} />
            <Route path="/buildings" element={<AdminLayout><Buildings /></AdminLayout>} />
            <Route path="/forum" element={<AdminLayout><Forum /></AdminLayout>} />
            <Route path="/chatbot" element={<AdminLayout><ChatbotSettings /></AdminLayout>} />
            <Route path="/settings" element={<AdminLayout><Settings /></AdminLayout>} />
            
            {/* Legacy admin routes for compatibility */}
            <Route path="/admin" element={<AdminLayout><Dashboard /></AdminLayout>} />
            <Route path="/admin/dashboard" element={<AdminLayout><Dashboard /></AdminLayout>} />
            <Route path="/admin/reports" element={<AdminLayout><Reports /></AdminLayout>} />
            <Route path="/admin/buildings" element={<AdminLayout><Buildings /></AdminLayout>} />
            <Route path="/admin/forum" element={<AdminLayout><Forum /></AdminLayout>} />
            <Route path="/admin/chatbot-settings" element={<AdminLayout><ChatbotSettings /></AdminLayout>} />
            <Route path="/admin/settings" element={<AdminLayout><Settings /></AdminLayout>} />
            
            {/* WEG-Eigentümer Routes */}
            <Route path="/weg-owner" element={<WegOwnerLayout><WegOwnerDashboard /></WegOwnerLayout>} />
            <Route path="/weg-owner/reports" element={<WegOwnerLayout><WegOwnerReports /></WegOwnerLayout>} />
            <Route path="/weg-owner/chatbot" element={<WegOwnerLayout><WegOwnerChatbot /></WegOwnerLayout>} />
            <Route path="/weg-owner/settings" element={<WegOwnerLayout><Settings /></WegOwnerLayout>} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
