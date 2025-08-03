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
    <Sidebar className={`${collapsed ? "w-16" : "w-72"} sidebar-enhanced border-r border-border/50 shadow-apple`}>
      <SidebarContent className="bg-gradient-warm text-foreground">
        {/* Header with Logo */}
        <div className="p-6 border-b border-border/20 bg-gradient-warm">
          {!collapsed ? (
            <div className="flex items-center space-x-3 animate-fade-in">
              <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center shadow-card">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">RGI</h1>
                <p className="text-xs text-muted-foreground">Immobilien</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center shadow-card">
                <Building2 className="h-5 w-5 text-white" />
              </div>
            </div>
          )}
        </div>

        {/* Management Mode Toggle */}
        <div className="p-6 border-b border-border/20">
          {!collapsed ? (
            <div className="space-y-4 animate-slide-up">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Verwaltungsmodus
              </label>
              <div className="flex bg-muted/50 rounded-xl p-1 gap-1">
                <Button
                  variant={managementMode === 'weg' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onModeChange('weg')}
                  className={`flex-1 rounded-lg transition-all duration-200 ${
                    managementMode === 'weg' 
                      ? 'bg-gradient-primary text-white shadow-apple' 
                      : 'hover:bg-background text-muted-foreground hover:text-foreground'
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
                      ? 'bg-gradient-primary text-white shadow-apple' 
                      : 'hover:bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Miete
                </Button>
              </div>
              <div className="text-center">
                <span className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-primary text-white shadow-card">
                  <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
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
                className="p-2 rounded-lg hover:bg-muted"
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
        <SidebarGroup className="px-4">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      className={({ isActive }) =>
                        isActive
                          ? "bg-white shadow-card text-foreground group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 border border-border/50"
                          : "text-muted-foreground hover:bg-white/50 hover:text-foreground group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-card"
                      }
                    >
                      <item.icon className="h-5 w-5 mr-3" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Section */}
        <div className="mt-auto p-4 border-t border-border/20">
          {!collapsed ? (
            <div className="space-y-3">
              <div className="bg-white/50 rounded-xl p-3 border border-border/50">
                <div className="text-sm">
                  <div className="font-semibold text-foreground">{profile?.first_name || 'Admin'}</div>
                  <div className="text-xs text-muted-foreground">{profile?.email}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200"
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
              className="w-full p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}