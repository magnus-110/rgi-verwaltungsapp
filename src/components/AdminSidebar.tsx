import React, { useState } from "react";
import { 
  BarChart3,
  ClipboardList, 
  Castle, 
  Sparkles,
  Settings,
  LogOut,
  ToggleLeft,
  ToggleRight,
  CheckSquare,
  CalendarDays,
  BookUser,
  Landmark,
  Mail,
  Users,
  CreditCard,
  Workflow,
  FolderKanban,
  CalendarClock,
  Briefcase,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Postfach", url: "/postfach", icon: Mail },
  { title: "NOVA", url: "/documents", icon: Sparkles },
  { title: "Aufgaben", url: "/todos", icon: CheckSquare },
  { title: "Kalender", url: "/calendar", icon: CalendarDays },
  { title: "Meldungen", url: "/tickets", icon: ClipboardList },
  { title: "Vorgänge", url: "/tickets/vorgaenge", icon: FolderKanban },
  { title: "Gebäude", url: "/buildings", icon: Castle },
  // "Jahreszyklus" als eigener Navigationspunkt entfernt – integriert ins Dashboard und Gebäude-Übersicht.
  { title: "Adressen", url: "/contacts", icon: BookUser },
  { title: "Versammlungen", url: "/versammlungen", icon: Users },
  { title: "Buchhaltung", url: "/finanzen", icon: Landmark },
  { title: "Zahlungen", url: "/zahlungen", icon: CreditCard },
  { title: "Prozesse", url: "/prozesse", icon: Workflow },
  { title: "RGI Intern", url: "/rgi-intern", icon: Briefcase, adminOnly: true },
  { title: "Einstellungen", url: "/settings", icon: Settings, adminOnly: true },
];

interface AdminSidebarProps {
  managementMode: 'weg' | 'rent';
  onModeChange: (mode: 'weg' | 'rent') => void;
}

export function AdminSidebar({ managementMode, onModeChange }: AdminSidebarProps) {
  const { state } = useSidebar();
  const { signOut, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  
  const collapsed = state === "collapsed";

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50";

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar className={`${collapsed ? "w-16" : "w-64"} border-r border-border`}>
      <SidebarContent className="bg-background">
        {/* Header with Logo */}
        <div className="p-4 border-b border-border">
          {!collapsed ? (
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/admin')}>
              <img 
                src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
                alt="RGI Immobilien Logo" 
                className="h-14 w-auto object-contain hover:opacity-80 transition-opacity"
              />
            </div>
          ) : (
            <div className="flex justify-center cursor-pointer" onClick={() => navigate('/admin')}>
              <img 
                src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
                alt="RGI Immobilien Logo" 
                className="h-10 w-auto object-contain hover:opacity-80 transition-opacity"
              />
            </div>
          )}
        </div>

        {/* Management Mode Toggle */}
        <div className="p-4 border-b border-border">
          {!collapsed ? (
            <div className="space-y-3">
              <label className="label-text text-xs uppercase tracking-wider text-muted-foreground">
                Verwaltungsmodus
              </label>
              <div className="flex bg-muted rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onModeChange('weg')}
                  className={`flex-1 rounded-md transition-colors ${
                    managementMode === 'weg' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-background text-muted-foreground'
                  }`}
                >
                  WEG
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onModeChange('rent')}
                  className={`flex-1 rounded-md transition-colors ${
                    managementMode === 'rent' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-background text-muted-foreground'
                  }`}
                >
                  Miete
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onModeChange(managementMode === 'weg' ? 'rent' : 'weg')}
                className="p-2 rounded-md hover:bg-muted"
              >
                {managementMode === 'weg' ? (
                  <ToggleLeft className="h-4 w-4 text-primary" />
                ) : (
                  <ToggleRight className="h-4 w-4 text-primary" />
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <SidebarGroup className="px-4 flex-1">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems
                .filter((item) => {
                  // adminOnly Einträge nur für Admins anzeigen
                  if ((item as any).adminOnly && profile?.role !== 'admin') return false;
                  // Mitarbeiter: Kein Chatbot, keine Einstellungen
                  if (profile?.role === 'employee') {
                    return !['Chatbot', 'Einstellungen'].includes(item.title);
                  }
                  return true;
                })
                .map((item) => {
                  // Aliases:
                  // - "Meldungen" (/tickets): aktiv bei /tickets exakt, /reports, /admin/reports
                  // - "Vorgänge" (/tickets/vorgaenge): aktiv bei diesem Pfad
                  let aliasActive = false;
                  if (item.url === "/tickets") {
                    aliasActive =
                      currentPath === "/tickets" ||
                      currentPath === "/reports" ||
                      currentPath === "/admin/reports";
                  } else if (item.url === "/tickets/vorgaenge") {
                    aliasActive = currentPath.startsWith("/tickets/vorgaenge");
                  }
                  return (
                <SidebarMenuItem key={item.title}>
                   <NavLink 
                    to={item.url} 
                    end={item.url === "/tickets"}
                    className={({ isActive }) =>
                      (isActive || aliasActive)
                        ? "bg-primary text-white group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                        : "text-foreground hover:bg-muted hover:text-foreground group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className="h-4 w-4 mr-3 flex-shrink-0" />
                        {!collapsed && <span className={`label-text ${(isActive || aliasActive) ? 'text-white' : ''}`}>{item.title}</span>}
                      </>
                    )}
                  </NavLink>
                </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Section */}
        <div className="p-4 border-t border-border">
          {!collapsed ? (
            <div className="space-y-3">
              <div className="bg-muted rounded-lg p-3">
                <div className="body-text text-sm">
                  <div className="heading-primary font-semibold text-foreground">{profile?.first_name || 'Admin'}</div>
                  <div className="body-secondary text-xs truncate">{profile?.email}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Abmelden
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="w-full p-2 rounded-md hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}