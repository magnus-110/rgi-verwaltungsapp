
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ManagementModeProvider } from "@/hooks/useManagementMode";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import { Login } from "./pages/Login";
import { AdminLayout } from "./components/AdminLayout";
import { TenantLayout } from "./components/TenantLayout";
import { WegOwnerLayout } from "./components/WegOwnerLayout";
import { Dashboard } from "./pages/Dashboard";
import { Reports } from "./pages/Reports";
import { Buildings } from "./pages/Buildings";
import { Forum } from "./pages/Forum";
import { Settings } from "./pages/Settings";
import { ChangePassword } from "./pages/ChangePassword";
import { WebhookSettings } from "./pages/WebhookSettings";
import { ChatbotSettings } from "./pages/ChatbotSettings";
import NotFound from "./pages/NotFound";
import Offline from "./pages/Offline";

// Tenant pages
import { TenantDashboard } from "./pages/tenant/Dashboard";
import { TenantReports } from "./pages/tenant/Reports";
import { TenantForum } from "./pages/tenant/Forum";
import { TenantSettings } from "./pages/tenant/Settings";
import { TenantChatbot } from "./pages/tenant/Chatbot";

// WEG Owner pages
import { WegOwnerDashboard } from "./pages/weg-owner/Dashboard";
import { WegOwnerReports } from "./pages/weg-owner/Reports";
import { WegOwnerForum } from "./pages/weg-owner/Forum";
import { WegOwnerSettings } from "./pages/weg-owner/Settings";
import { WegOwnerChatbot } from "./pages/weg-owner/Chatbot";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              
              {/* Admin routes */}
              <Route path="/admin" element={<AdminLayout><Dashboard /></AdminLayout>} />
              <Route path="/dashboard" element={<AdminLayout><Dashboard /></AdminLayout>} />
              <Route path="/reports" element={<AdminLayout><Reports /></AdminLayout>} />
              <Route path="/buildings" element={<AdminLayout><Buildings /></AdminLayout>} />
              <Route path="/forum" element={<AdminLayout><Forum /></AdminLayout>} />
              <Route path="/chatbot" element={<AdminLayout><ChatbotSettings /></AdminLayout>} />
              <Route path="/webhook-settings" element={<AdminLayout><WebhookSettings /></AdminLayout>} />
              <Route path="/settings" element={<AdminLayout><Settings /></AdminLayout>} />
              <Route path="/change-password" element={<ChangePassword />} />
              
              {/* Tenant routes */}
              <Route path="/tenant" element={<TenantLayout><TenantDashboard /></TenantLayout>} />
              <Route path="/tenant/dashboard" element={<TenantLayout><TenantDashboard /></TenantLayout>} />
              <Route path="/tenant/reports" element={<TenantLayout><TenantReports /></TenantLayout>} />
              <Route path="/tenant/forum" element={<TenantLayout><TenantForum /></TenantLayout>} />
              <Route path="/tenant/chatbot" element={<TenantLayout><TenantChatbot /></TenantLayout>} />
              <Route path="/tenant/settings" element={<TenantLayout><TenantSettings /></TenantLayout>} />
              
              {/* WEG Owner routes */}
              <Route path="/weg-owner" element={<WegOwnerLayout><WegOwnerDashboard /></WegOwnerLayout>} />
              <Route path="/weg-owner/dashboard" element={<WegOwnerLayout><WegOwnerDashboard /></WegOwnerLayout>} />
              <Route path="/weg-owner/reports" element={<WegOwnerLayout><WegOwnerReports /></WegOwnerLayout>} />
              <Route path="/weg-owner/forum" element={<WegOwnerLayout><WegOwnerForum /></WegOwnerLayout>} />
              <Route path="/weg-owner/chatbot" element={<WegOwnerLayout><WegOwnerChatbot /></WegOwnerLayout>} />
              <Route path="/weg-owner/settings" element={<WegOwnerLayout><WegOwnerSettings /></WegOwnerLayout>} />
              
              <Route path="/offline" element={<Offline />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
