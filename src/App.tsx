import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { UploadProvider } from "@/contexts/UploadContext";
import { ComposeEmailProvider } from "@/contexts/ComposeEmailContext";
import { FloatingComposeWindow } from "@/components/email/FloatingComposeWindow";
import { ScrollToTop } from "@/components/ScrollToTop";
import { InAppNotificationsProvider } from "@/contexts/InAppNotificationsProvider";
import { FiscalYearProvider } from "@/contexts/FiscalYearContext";

// Eager: Entry, Auth, Layouts, Dashboard (häufigster Einstieg)
import Index from "./pages/Index";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { AdminLayout } from "./components/AdminLayout";
import { WegOwnerLayout } from "./components/WegOwnerLayout";
import { TenantLayout } from "./components/TenantLayout";

// Lazy: Heavy & weniger frequente Routen → eigene Chunks
const ChangePassword = lazy(() => import("./pages/ChangePassword").then(m => ({ default: m.ChangePassword })));
const MagicLinkLogin = lazy(() => import("./pages/MagicLinkLogin").then(m => ({ default: m.MagicLinkLogin })));
const ConfirmEmailChange = lazy(() => import("./pages/ConfirmEmailChange").then(m => ({ default: m.ConfirmEmailChange })));
const Tickets = lazy(() => import("./pages/Tickets").then(m => ({ default: m.Tickets })));
const Buildings = lazy(() => import("./pages/Buildings").then(m => ({ default: m.Buildings })));
const Settings = lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const WebhookSettings = lazy(() => import("./pages/WebhookSettings").then(m => ({ default: m.WebhookSettings })));
const Todos = lazy(() => import("./pages/Todos").then(m => ({ default: m.Todos })));
const Calendar = lazy(() => import("./pages/Calendar").then(m => ({ default: m.Calendar })));
const Contacts = lazy(() => import("./pages/Contacts").then(m => ({ default: m.Contacts })));
const Finance = lazy(() => import("./pages/Finance").then(m => ({ default: m.Finance })));
const Billing = lazy(() => import("./pages/Billing").then(m => ({ default: m.Billing })));
const Processes = lazy(() => import("./pages/Processes").then(m => ({ default: m.Processes })));
const Jahreszyklus = lazy(() => import("./pages/Jahreszyklus"));
const RgiIntern = lazy(() => import("./pages/RgiIntern"));

const Inbox = lazy(() => import("./pages/Inbox").then(m => ({ default: m.Inbox })));
const Meetings = lazy(() => import("./pages/Meetings").then(m => ({ default: m.Meetings })));
const EtvProxy = lazy(() => import("./pages/EtvProxy").then(m => ({ default: m.EtvProxy })));
const CashAuditProxy = lazy(() => import("./pages/CashAuditProxy").then(m => ({ default: m.CashAuditProxy })));
const Transfers = lazy(() => import("./pages/Transfers").then(m => ({ default: m.Transfers })));

const WegOwnerDashboard = lazy(() => import("./pages/weg-owner/Dashboard").then(m => ({ default: m.WegOwnerDashboard })));
const WegOwnerReports = lazy(() => import("./pages/weg-owner/Reports").then(m => ({ default: m.WegOwnerReports })));
const WegOwnerForum = lazy(() => import("./pages/weg-owner/Forum").then(m => ({ default: m.WegOwnerForum })));
const WegOwnerChatbot = lazy(() => import("./pages/weg-owner/Chatbot").then(m => ({ default: m.WegOwnerChatbot })));
const WegOwnerSettings = lazy(() => import("./pages/weg-owner/Settings").then(m => ({ default: m.WegOwnerSettings })));
const WegOwnerFiles = lazy(() => import("./pages/weg-owner/Files").then(m => ({ default: m.WegOwnerFiles })));
const WegOwnerMeetings = lazy(() => import("./pages/weg-owner/Meetings").then(m => ({ default: m.WegOwnerMeetings })));
const WegOwnerCashAudit = lazy(() => import("./pages/weg-owner/CashAudit").then(m => ({ default: m.WegOwnerCashAudit })));
const WegOwnerResolutions = lazy(() => import("./pages/weg-owner/Resolutions").then(m => ({ default: m.WegOwnerResolutions })));

const TenantDashboard = lazy(() => import("./pages/tenant/Dashboard").then(m => ({ default: m.TenantDashboard })));
const TenantReports = lazy(() => import("./pages/tenant/Reports").then(m => ({ default: m.TenantReports })));
const TenantForum = lazy(() => import("./pages/tenant/Forum").then(m => ({ default: m.TenantForum })));
const TenantChatbot = lazy(() => import("./pages/tenant/Chatbot").then(m => ({ default: m.TenantChatbot })));
const TenantSettings = lazy(() => import("./pages/tenant/Settings").then(m => ({ default: m.TenantSettings })));
const TenantFiles = lazy(() => import("./pages/tenant/Files").then(m => ({ default: m.TenantFiles })));

const NotFound = lazy(() => import("./pages/NotFound"));
const Offline = lazy(() => import("./pages/Offline"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <FiscalYearProvider>
          <ComposeEmailProvider>
            <UploadProvider>
              <InAppNotificationsProvider>
              <Toaster />
              <Sonner />
              <FloatingComposeWindow />
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/login/magic/:token" element={<MagicLinkLogin />} />
              <Route path="/confirm-email-change/:token" element={<ConfirmEmailChange />} />
              
              {/* Admin Routes */}
              <Route path="/admin/change-password" element={<AdminLayout><ChangePassword /></AdminLayout>} />
              <Route path="/dashboard" element={<AdminLayout><Dashboard /></AdminLayout>} />
              <Route path="/reports" element={<AdminLayout><Tickets /></AdminLayout>} />
              <Route path="/tickets" element={<AdminLayout><Tickets /></AdminLayout>} />
              <Route path="/tickets/vorgaenge" element={<AdminLayout><Tickets /></AdminLayout>} />
              <Route path="/buildings" element={<AdminLayout><Buildings /></AdminLayout>} />
              <Route path="/buildings/:id" element={<AdminLayout><Buildings /></AdminLayout>} />
              <Route path="/forum" element={<Navigate to="/buildings" replace />} />
              <Route path="/chatbot" element={<Navigate to="/settings?tab=chatbot" replace />} />
              <Route path="/webhooks" element={<AdminLayout><WebhookSettings /></AdminLayout>} />
              <Route path="/settings" element={<AdminLayout><Settings /></AdminLayout>} />
              <Route path="/todos" element={<AdminLayout><Todos /></AdminLayout>} />
              <Route path="/calendar" element={<AdminLayout><Calendar /></AdminLayout>} />
              <Route path="/files" element={<Navigate to="/buildings" replace />} />
              <Route path="/contacts" element={<AdminLayout><Contacts /></AdminLayout>} />
              <Route path="/finanzen" element={<AdminLayout><Finance /></AdminLayout>} />
              <Route path="/finanzen/abrechnung" element={<AdminLayout><Billing /></AdminLayout>} />
              <Route path="/finanzen/wirtschaftsplan" element={<Navigate to="/finanzen" replace />} />
              <Route path="/postfach" element={<AdminLayout><Inbox /></AdminLayout>} />
              <Route path="/versammlungen" element={<AdminLayout><Meetings /></AdminLayout>} />
              <Route path="/zahlungen" element={<AdminLayout><Transfers /></AdminLayout>} />
              <Route path="/ueberweisungen" element={<Navigate to="/zahlungen" replace />} />
              <Route path="/prozesse" element={<AdminLayout><Processes /></AdminLayout>} />
              <Route path="/jahreszyklus" element={<AdminLayout><Jahreszyklus /></AdminLayout>} />
              <Route path="/rgi-intern" element={<AdminLayout><RgiIntern /></AdminLayout>} />
              
              
              {/* Legacy admin routes for compatibility */}
              <Route path="/admin" element={<AdminLayout><Dashboard /></AdminLayout>} />
              <Route path="/admin/dashboard" element={<AdminLayout><Dashboard /></AdminLayout>} />
              <Route path="/admin/reports" element={<AdminLayout><Tickets /></AdminLayout>} />
              <Route path="/admin/buildings" element={<AdminLayout><Buildings /></AdminLayout>} />
              <Route path="/admin/forum" element={<Navigate to="/buildings" replace />} />
              <Route path="/admin/chatbot-settings" element={<Navigate to="/settings?tab=chatbot" replace />} />
              <Route path="/admin/settings" element={<AdminLayout><Settings /></AdminLayout>} />
              
              {/* WEG-Eigentümer Routes */}
              <Route path="/weg-owner/change-password" element={<WegOwnerLayout><ChangePassword /></WegOwnerLayout>} />
              <Route path="/weg-owner" element={<WegOwnerLayout><WegOwnerDashboard /></WegOwnerLayout>} />
              <Route path="/weg-owner/reports" element={<WegOwnerLayout><WegOwnerReports /></WegOwnerLayout>} />
              <Route path="/weg-owner/forum" element={<WegOwnerLayout><WegOwnerForum /></WegOwnerLayout>} />
              <Route path="/weg-owner/chatbot" element={<WegOwnerLayout><WegOwnerChatbot /></WegOwnerLayout>} />
              <Route path="/weg-owner/settings" element={<WegOwnerLayout><WegOwnerSettings /></WegOwnerLayout>} />
              <Route path="/weg-owner/files" element={<WegOwnerLayout><WegOwnerFiles /></WegOwnerLayout>} />
              <Route path="/weg-owner/meetings" element={<WegOwnerLayout><WegOwnerMeetings /></WegOwnerLayout>} />
              <Route path="/weg-owner/kassenpruefung" element={<WegOwnerLayout><WegOwnerCashAudit /></WegOwnerLayout>} />
              <Route path="/weg-owner/resolutions" element={<WegOwnerLayout><WegOwnerResolutions /></WegOwnerLayout>} />
              
              {/* Tenant Routes */}
              <Route path="/tenant/change-password" element={<TenantLayout><ChangePassword /></TenantLayout>} />
              <Route path="/tenant" element={<TenantLayout><TenantDashboard /></TenantLayout>} />
              <Route path="/tenant/reports" element={<TenantLayout><TenantReports /></TenantLayout>} />
              <Route path="/tenant/forum" element={<TenantLayout><TenantForum /></TenantLayout>} />
              <Route path="/tenant/chatbot" element={<TenantLayout><TenantChatbot /></TenantLayout>} />
              <Route path="/tenant/settings" element={<TenantLayout><TenantSettings /></TenantLayout>} />
              <Route path="/tenant/files" element={<TenantLayout><TenantFiles /></TenantLayout>} />
              
              <Route path="/etv-proxy/:token" element={<EtvProxy />} />
              <Route path="/kassenpruefung/:token" element={<CashAuditProxy />} />
              <Route path="/offline" element={<Offline />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
              </InAppNotificationsProvider>
            </UploadProvider>
          </ComposeEmailProvider>
          </FiscalYearProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
