import { NavLink, useLocation } from "react-router-dom";
import { Home, FileText, MessageCircle, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationItems = [
  {
    title: "Dashboard",
    url: "/weg-owner",
    icon: Home,
  },
  {
    title: "Meldungen",
    url: "/weg-owner/reports",
    icon: FileText,
  },
  {
    title: "Chatbot",
    url: "/weg-owner/chatbot",
    icon: MessageCircle,
  },
  {
    title: "Einstellungen",
    url: "/weg-owner/settings",
    icon: Settings,
  },
];

export const WegOwnerSidebar = () => {
  const { state } = useSidebar();
  const location = useLocation();
  const { profile } = useAuth();
  const currentPath = location.pathname;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Erfolgreich abgemeldet",
        description: "Sie wurden erfolgreich abgemeldet.",
      });
    } catch (error) {
      toast({
        title: "Fehler beim Abmelden",
        description: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    }
  };

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-muted text-primary font-medium" : "hover:bg-muted/50";

  return (
    <Sidebar className={state === "collapsed" ? "w-14" : "w-60"}>
      <SidebarContent>
        <div className="p-4 border-b">
          {state !== "collapsed" && (
            <div className="flex items-center gap-2">
              <img 
                src="/lovable-uploads/2f4fde3b-f4b0-4829-9fcb-a148e37bae43.png" 
                alt="RGI Logo"
                className="w-8 h-8"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{profile?.first_name} {profile?.last_name}</span>
                <span className="text-xs text-muted-foreground">WEG-Eigentümer</span>
              </div>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={getNavCls}>
                      <item.icon className="h-4 w-4" />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} className="hover:bg-muted/50 text-destructive">
                  <LogOut className="h-4 w-4" />
                  {state !== "collapsed" && <span>Abmelden</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};