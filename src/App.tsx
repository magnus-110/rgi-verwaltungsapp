import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ManagementModeProvider } from "@/hooks/useManagementMode";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import Buildings from "./pages/Buildings";
import Forum from "./pages/Forum";
import Settings from "./pages/Settings";
import ChangePassword from "./pages/ChangePassword";
import WebhookSettings from "./pages/WebhookSettings";
import { ChatbotSettings } from "./pages/ChatbotSettings";
import NotFound from "./pages/NotFound";
import Offline from "./pages/Offline";

// Tenant pages
import TenantDashboard from "./pages/tenant/Dashboard";
import TenantReports from "./pages/tenant/Reports";
import TenantForum from "./pages/tenant/Forum";
import TenantSettings from "./pages/tenant/Settings";
import { TenantChatbot } from "./pages/tenant/Chatbot";

// WEG Owner pages
import WegOwnerDashboard from "./pages/weg-owner/Dashboard";
import WegOwnerReports from "./pages/weg-owner/Reports";
import WegOwnerForum from "./pages/weg-owner/Forum";
import WegOwnerSettings from "./pages/weg-owner/Settings";
import { WegOwnerChatbot } from "./pages/weg-owner/Chatbot";

import { useAuth } from "@/hooks/useAuth";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ManagementModeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              
              {/* Admin routes */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/buildings" element={<ProtectedRoute><Buildings /></ProtectedRoute>} />
              <Route path="/forum" element={<ProtectedRoute><Forum /></ProtectedRoute>} />
              <Route path="/chatbot" element={<ProtectedRoute><ChatbotSettings /></ProtectedRoute>} />
              <Route path="/webhook-settings" element={<ProtectedRoute><WebhookSettings /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
              
              {/* Tenant routes */}
              <Route path="/tenant/dashboard" element={<ProtectedRoute><TenantDashboard /></ProtectedRoute>} />
              <Route path="/tenant/reports" element={<ProtectedRoute><TenantReports /></ProtectedRoute>} />
              <Route path="/tenant/forum" element={<ProtectedRoute><TenantForum /></ProtectedRoute>} />
              <Route path="/tenant/chatbot" element={<ProtectedRoute><TenantChatbot /></ProtectedRoute>} />
              <Route path="/tenant/settings" element={<ProtectedRoute><TenantSettings /></ProtectedRoute>} />
              
              {/* WEG Owner routes */}
              <Route path="/weg-owner/dashboard" element={<ProtectedRoute><WegOwnerDashboard /></ProtectedRoute>} />
              <Route path="/weg-owner/reports" element={<ProtectedRoute><WegOwnerReports /></ProtectedRoute>} />
              <Route path="/weg-owner/forum" element={<ProtectedRoute><WegOwnerForum /></ProtectedRoute>} />
              <Route path="/weg-owner/chatbot" element={<ProtectedRoute><WegOwnerChatbot /></ProtectedRoute>} />
              <Route path="/weg-owner/settings" element={<ProtectedRoute><WegOwnerSettings /></ProtectedRoute>} />
              
              <Route path="/offline" element={<Offline />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ManagementModeProvider>
    </QueryClientProvider>
  );
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default App;
