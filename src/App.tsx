import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { UploadProvider } from "@/contexts/UploadContext";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";
import { Login } from "./pages/Login";
import { ChangePassword } from "./pages/ChangePassword";
import { Dashboard } from "./pages/Dashboard";
import { Reports } from "./pages/Reports";
import { Buildings } from "./pages/Buildings";
import { Forum } from "./pages/Forum";
import { ChatbotSettings } from "./pages/ChatbotSettings";
import { Settings } from "./pages/Settings";
import { Documents } from "./pages/Documents";
import { DocumentSettings } from "./pages/DocumentSettings";
import { WebhookSettings } from "./pages/WebhookSettings";
import { ReorganizationAgents } from "./pages/ReorganizationAgents";
import { ReorganizationDashboard } from "./pages/ReorganizationDashboard";
import { AdminLayout } from "./components/AdminLayout";
import { WegOwnerLayout } from "./components/WegOwnerLayout";
import { WegOwnerDashboard } from "./pages/weg-owner/Dashboard";
import { WegOwnerReports } from "./pages/weg-owner/Reports";
import { WegOwnerForum } from "./pages/weg-owner/Forum";
import { WegOwnerChatbot } from "./pages/weg-owner/Chatbot";
import { WegOwnerSettings } from "./pages/weg-owner/Settings";
import { TenantLayout } from "./components/TenantLayout";
import { TenantDashboard } from "./pages/tenant/Dashboard";
import { TenantReports } from "./pages/tenant/Reports";
import { TenantForum } from "./pages/tenant/Forum";
import { TenantChatbot } from "./pages/tenant/Chatbot";
import { TenantSettings } from "./pages/tenant/Settings";
import NotFound from "./pages/NotFound";
import Offline from "./pages/Offline";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <UploadProvider>
            <Toaster />
            <Sonner />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ChangePassword />} />
              
              {/* Admin Routes */}
              <Route path="/admin/change-password" element={<AdminLayout><ChangePassword /></AdminLayout>} />
              <Route path="/dashboard" element={<AdminLayout><Dashboard /></AdminLayout>} />
              <Route path="/reports" element={<AdminLayout><Reports /></AdminLayout>} />
              <Route path="/buildings" element={<AdminLayout><Buildings /></AdminLayout>} />
              <Route path="/forum" element={<AdminLayout><Forum /></AdminLayout>} />
              <Route path="/documents" element={<AdminLayout><Documents /></AdminLayout>} />
              <Route path="/documents/settings" element={<AdminLayout><DocumentSettings /></AdminLayout>} />
              <Route path="/documents/agents" element={<AdminLayout><ReorganizationAgents /></AdminLayout>} />
              <Route path="/documents/reorganize" element={<AdminLayout><ReorganizationDashboard /></AdminLayout>} />
              <Route path="/chatbot" element={<AdminLayout><ChatbotSettings /></AdminLayout>} />
              <Route path="/webhooks" element={<AdminLayout><WebhookSettings /></AdminLayout>} />
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
              <Route path="/weg-owner/change-password" element={<WegOwnerLayout><ChangePassword /></WegOwnerLayout>} />
              <Route path="/weg-owner" element={<WegOwnerLayout><WegOwnerDashboard /></WegOwnerLayout>} />
              <Route path="/weg-owner/reports" element={<WegOwnerLayout><WegOwnerReports /></WegOwnerLayout>} />
              <Route path="/weg-owner/forum" element={<WegOwnerLayout><WegOwnerForum /></WegOwnerLayout>} />
              <Route path="/weg-owner/chatbot" element={<WegOwnerLayout><WegOwnerChatbot /></WegOwnerLayout>} />
              <Route path="/weg-owner/settings" element={<WegOwnerLayout><WegOwnerSettings /></WegOwnerLayout>} />
              
              {/* Tenant Routes */}
              <Route path="/tenant/change-password" element={<TenantLayout><ChangePassword /></TenantLayout>} />
              <Route path="/tenant" element={<TenantLayout><TenantDashboard /></TenantLayout>} />
              <Route path="/tenant/reports" element={<TenantLayout><TenantReports /></TenantLayout>} />
              <Route path="/tenant/forum" element={<TenantLayout><TenantForum /></TenantLayout>} />
              <Route path="/tenant/chatbot" element={<TenantLayout><TenantChatbot /></TenantLayout>} />
              <Route path="/tenant/settings" element={<TenantLayout><TenantSettings /></TenantLayout>} />
              
              <Route path="/offline" element={<Offline />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </UploadProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
