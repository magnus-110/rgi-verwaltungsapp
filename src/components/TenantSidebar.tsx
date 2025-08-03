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
    <Sidebar className="border-r border-border/50 bg-gradient-warm shadow-apple">
      <SidebarHeader className="p-6 border-b border-border/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center shadow-card">
            <Home className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">RGI</h1>
            <p className="text-xs text-muted-foreground">Mieter Portal</p>
          </div>
        </div>
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