import { useState } from "react";
import { 
  LayoutDashboard, 
  AlertCircle, 
  Building2, 
  MessageSquare, 
  Bot, 
  Settings,
  LogOut,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Meldungen", url: "/reports", icon: AlertCircle },
  { title: "Gebäude", url: "/buildings", icon: Building2 },
  { title: "Forum", url: "/forum", icon: MessageSquare },
  { title: "Chatbot", url: "/chatbot", icon: Bot },
  { title: "Einstellungen", url: "/settings", icon: Settings },
];

interface AdminSidebarProps {
  managementMode: 'weg' | 'rent';
  onModeChange: (mode: 'weg' | 'rent') => void;
}

export function AdminSidebar({ managementMode, onModeChange }: AdminSidebarProps) {
  const { state } = useSidebar();
  const { signOut, profile } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;
  
  const collapsed = state === "collapsed";

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50";

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar className={collapsed ? "w-14" : "w-64"}>
      <SidebarContent className="bg-sidebar text-sidebar-foreground">
        {/* Header with Logo */}
        <div className="p-4 border-b border-sidebar-border">
          {!collapsed ? (
            <div className="flex items-center space-x-3">
              <img 
                src="/lovable-uploads/8cc4ac02-ecfc-41ef-945a-738115d31106.png" 
                alt="RGI" 
                className="h-8 w-auto"
              />
              <span className="font-bold text-lg">RGI Admin</span>
            </div>
          ) : (
            <div className="flex justify-center">
              <img 
                src="/lovable-uploads/8cc4ac02-ecfc-41ef-945a-738115d31106.png" 
                alt="RGI" 
                className="h-8 w-auto"
              />
            </div>
          )}
        </div>

        {/* Management Mode Toggle */}
        <div className="p-4 border-b border-sidebar-border">
          {!collapsed ? (
            <div className="space-y-3">
              <label className="text-sm font-medium text-sidebar-foreground">
                Verwaltungsmodus
              </label>
              <div className="flex items-center justify-between">
                <Button
                  variant={managementMode === 'weg' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onModeChange('weg')}
                  className={managementMode === 'weg' ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''}
                >
                  WEG
                </Button>
                <Button
                  variant={managementMode === 'rent' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onModeChange('rent')}
                  className={managementMode === 'rent' ? 'bg-sidebar-primary text-sidebar-primary-foreground' : ''}
                >
                  Miete
                </Button>
              </div>
              <Badge variant="outline" className="w-full justify-center">
                {managementMode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'}
              </Badge>
            </div>
          ) : (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onModeChange(managementMode === 'weg' ? 'rent' : 'weg')}
                className="p-2"
              >
                {managementMode === 'weg' ? (
                  <ToggleLeft className="h-4 w-4" />
                ) : (
                  <ToggleRight className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={getNavCls}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Section */}
        <div className="mt-auto p-4 border-t border-sidebar-border">
          {!collapsed ? (
            <div className="space-y-2">
              <div className="text-sm">
                <div className="font-medium">{profile?.first_name || 'Admin'}</div>
                <div className="text-xs text-sidebar-foreground/70">{profile?.email}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
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
              className="w-full p-2"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}