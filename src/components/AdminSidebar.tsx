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
    <Sidebar className={`${collapsed ? "w-16" : "w-72"} sidebar-enhanced`}>
      <SidebarContent className="bg-sidebar text-sidebar-foreground">
        {/* Header with Logo */}
        <div className="p-6 border-b border-sidebar-border bg-gradient-to-r from-primary/5 to-transparent">
          {!collapsed ? (
            <div className="flex items-center space-x-3 animate-fade-in">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center shadow-md p-2">
                <img 
                  src={rgiLogo} 
                  alt="RGI Immobilien" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <span className="font-bold text-xl text-foreground">RGI Immobilien</span>
                <p className="text-sm text-muted-foreground">Verwaltungsportal</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center shadow-md p-2">
                <img 
                  src={rgiLogo} 
                  alt="RGI Immobilien" 
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}
        </div>

        {/* Management Mode Toggle */}
        <div className="p-6 border-b border-sidebar-border">
          {!collapsed ? (
            <div className="space-y-4 animate-slide-up">
              <label className="text-sm font-semibold text-foreground">
                Verwaltungsmodus
              </label>
              <div className="flex bg-muted rounded-xl p-1 gap-1">
                <Button
                  variant={managementMode === 'weg' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onModeChange('weg')}
                  className={`flex-1 rounded-lg transition-all duration-200 ${
                    managementMode === 'weg' 
                      ? 'bg-primary text-primary-foreground shadow-md' 
                      : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  WEG
                </Button>
                <Button
                  variant={managementMode === 'rent' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onModeChange('rent')}
                  className={`flex-1 rounded-lg transition-all duration-200 ${
                    managementMode === 'rent' 
                      ? 'bg-primary text-primary-foreground shadow-md' 
                      : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Miete
                </Button>
              </div>
              <div className="text-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {managementMode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'}
                </span>
              </div>
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