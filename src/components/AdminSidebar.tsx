import React, { useState } from "react";
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
import rgiLogo from "@/assets/rgi-logo.png";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Meldungen", url: "/reports", icon: AlertCircle },
  { title: "Gebäude", url: "/buildings", icon: Building2 },
  { title: "Schwarzes Brett", url: "/forum", icon: MessageSquare },
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
    <Sidebar className={`${collapsed ? "w-16" : "w-64"} border-r border-border`}>
      <SidebarContent className="bg-background">
        {/* Header with Logo */}
        <div className="p-4 border-b border-border">
          {!collapsed ? (
            <div className="flex items-center space-x-3">
              <img 
                src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
                alt="RGI Immobilien Logo" 
                className="h-14 w-auto object-contain"
              />
            </div>
          ) : (
            <div className="flex justify-center">
              <img 
                src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
                alt="RGI Immobilien Logo" 
                className="h-10 w-auto object-contain"
              />
            </div>
          )}
        </div>

        {/* Management Mode Toggle */}
        <div className="p-4 border-b border-border">
          {!collapsed ? (
            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <NavLink 
                    to={item.url} 
                    className={({ isActive }) =>
                      isActive
                        ? "bg-primary text-primary-foreground group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                        : "text-gray-700 hover:bg-muted hover:text-gray-700 group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                    }
                  >
                    <item.icon className="h-4 w-4 mr-3 flex-shrink-0" />
                    {!collapsed && <span className="font-medium">{item.title}</span>}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Section */}
        <div className="p-4 border-t border-border">
          {!collapsed ? (
            <div className="space-y-3">
              <div className="bg-muted rounded-lg p-3">
                <div className="text-sm">
                  <div className="font-medium text-foreground">{profile?.first_name || 'Admin'}</div>
                  <div className="text-xs text-muted-foreground truncate">{profile?.email}</div>
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