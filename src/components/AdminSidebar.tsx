
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
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useManagementMode } from "@/hooks/useManagementMode";

const sidebarItems = [
  { icon: Home, label: "Dashboard", href: "/dashboard" },
  { icon: FileText, label: "Meldungen", href: "/reports" },
  { icon: Building, label: "Gebäude", href: "/buildings" },
  { icon: MessageSquare, label: "Forum", href: "/forum" },
  { icon: Webhook, label: "Webhook-Einstellungen", href: "/webhook-settings" },
  { icon: Settings, label: "Einstellungen", href: "/settings" },
  { icon: Key, label: "Passwort ändern", href: "/change-password" },
];

export const AdminSidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();
  const { managementMode } = useManagementMode();

  const isActive = (href: string) => location.pathname === href;

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b">
        {!isCollapsed ? (
          <div className="flex items-center gap-2">
            <Building className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">RGI Admin</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={managementMode === "weg" ? "default" : "secondary"} className="text-xs">
                  {managementMode === "weg" ? "WEG" : "Miete"}
                </Badge>
              </div>
            </div>
          </div>
        ) : (
          <Building className="h-8 w-8 text-primary mx-auto" />
        )}
      </div>
      
      <nav className="p-2 space-y-1">
        {sidebarItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setIsMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <item.icon className="h-5 w-5" />
            {!isCollapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>
    </>
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
