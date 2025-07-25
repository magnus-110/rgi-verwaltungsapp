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
  Bot, 
  Settings,
  LogOut 
} from "lucide-react";

export const WegOwnerSidebar = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { icon: Home, label: "Dashboard", path: "/weg-owner" },
    { icon: AlertCircle, label: "Meldungen", path: "/weg-owner/reports" },
    { icon: Bot, label: "KI-Chatbot", path: "/weg-owner/chatbot" },
    { icon: Settings, label: "Einstellungen", path: "/weg-owner/settings" },
  ];

  const isActivePath = (path: string) => {
    if (path === "/weg-owner") {
      return location.pathname === "/weg-owner";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar className="border-r border-border bg-card">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">RGI</span>
            </div>
            <div>
              <h2 className="font-bold text-foreground text-base leading-tight">
                <span className="text-orange-500">RGI</span> <span className="text-gray-700">IMMOBILIEN</span>
              </h2>
              <p className="text-xs text-muted-foreground leading-tight">WEG-Eigentümer</p>
            </div>
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