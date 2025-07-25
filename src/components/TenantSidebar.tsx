import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { 
  Home, 
  AlertCircle, 
  MessageSquare,
  Bot, 
  Settings,
  LogOut 
} from "lucide-react";

export const TenantSidebar = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { icon: Home, label: "Dashboard", path: "/tenant" },
    { icon: AlertCircle, label: "Meldungen", path: "/tenant/reports" },
    { icon: MessageSquare, label: "Forum", path: "/tenant/forum" },
    { icon: Bot, label: "KI-Chatbot", path: "/tenant/chatbot" },
    { icon: Settings, label: "Einstellungen", path: "/tenant/settings" },
  ];

  const isActivePath = (path: string) => {
    if (path === "/tenant") {
      return location.pathname === "/tenant";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar className="border-r border-border bg-card">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img 
              src="/lovable-uploads/c277a1e9-0f05-4981-b003-702e438b2faa.png" 
              alt="RGI Immobilien Logo" 
              className="h-10 w-auto object-contain"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Mieter Portal</p>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton
                onClick={() => navigate(item.path)}
                className={`w-full justify-start gap-3 ${
                  isActivePath(item.path) 
                    ? "bg-accent text-accent-foreground" 
                    : "hover:bg-accent/50"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" />
          Abmelden
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};