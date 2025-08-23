
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Home,
  FileText,
  Building,
  MessageSquare,
  Settings,
  Bot,
  Webhook,
  Key,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useManagementMode } from "@/hooks/useManagementMode";
import { useAuth } from "@/hooks/useAuth";

const sidebarItems = [
  { icon: Home, label: "Dashboard", href: "/dashboard" },
  { icon: FileText, label: "Meldungen", href: "/reports" },
  { icon: Building, label: "Gebäude", href: "/buildings" },
  { icon: MessageSquare, label: "Schwarzes Brett", href: "/forum" },
  { icon: Bot, label: "Chatbot", href: "/chatbot-settings" },
  { icon: MessageSquare, label: "Chatbot Gespräche", href: "/chatbot" },
  { icon: Webhook, label: "Webhooks", href: "/webhook-settings" },
  { icon: Settings, label: "Einstellungen", href: "/settings" },
];

export const AdminSidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();
  const { managementMode, setManagementMode } = useManagementMode();
  const { profile, signOut } = useAuth();

  const isActive = (href: string) => location.pathname === href;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">RGI</span>
          </div>
          {!isCollapsed && (
            <div>
              <div className="text-orange-500 font-semibold text-sm">RGI IMMOBILIEN</div>
              <div className="text-xs text-gray-500">Verkauf · Vermietung · Verwaltung</div>
            </div>
          )}
        </div>
        
        {!isCollapsed && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide">VERWALTUNGSMODUS</div>
            <div className="flex gap-1 bg-gray-100 rounded p-1">
              <button
                onClick={() => setManagementMode("weg")}
                className={`flex-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
                  managementMode === "weg" 
                    ? "bg-orange-500 text-white" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                WEG
              </button>
              <button
                onClick={() => setManagementMode("rent")}
                className={`flex-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
                  managementMode === "rent" 
                    ? "bg-orange-500 text-white" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Miete
              </button>
            </div>
          </div>
        )}
      </div>
      
      <nav className="flex-1 p-2 space-y-1">
        {sidebarItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setIsMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors rounded",
              isActive(item.href)
                ? "bg-gray-100 text-gray-900"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            )}
          >
            <item.icon className="h-4 w-4" />
            {!isCollapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Admin User Section */}
      {!isCollapsed && (
        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-2">
            <User className="h-4 w-4 text-gray-600" />
            <div className="text-sm">
              <div className="font-medium text-gray-900">Admin</div>
              <div className="text-xs text-gray-500">{profile?.email}</div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Abmelden</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 z-40 h-full w-64 bg-background border-r transform transition-transform duration-200 lg:hidden",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </aside>

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col h-screen bg-background border-r transition-all duration-200",
        isCollapsed ? "w-16" : "w-64"
      )}>
        <SidebarContent />
        
        {/* Collapse Toggle */}
        <div className="mt-auto p-2 border-t">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </aside>
    </>
  );
};
