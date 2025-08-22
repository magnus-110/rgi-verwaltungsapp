import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { 
  House, 
  Shield, 
  Newspaper, 
  Sparkles, 
  Settings,
  LogOut,
  UserRound
} from "lucide-react";

interface TopNavigationProps {
  userRole: 'tenant' | 'weg_owner' | 'admin';
}

export const TopNavigation = ({ userRole }: TopNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile } = useAuth();

  const getNavigationItems = () => {
    const baseItems = [
      { 
        icon: House, 
        label: "Dashboard", 
        path: userRole === 'tenant' ? '/tenant' : '/weg-owner',
        active: location.pathname === (userRole === 'tenant' ? '/tenant' : '/weg-owner')
      }
    ];

    if (userRole === 'tenant') {
      return [
        ...baseItems,
        { 
          icon: Shield, 
          label: "Meine Tickets", 
          path: '/tenant/reports',
          active: location.pathname.startsWith('/tenant/reports')
        },
        { 
          icon: Newspaper, 
          label: "Schwarzes Brett", 
          path: '/tenant/forum',
          active: location.pathname.startsWith('/tenant/forum')
        },
        { 
          icon: Sparkles, 
          label: "Chat", 
          path: '/tenant/chatbot',
          active: location.pathname.startsWith('/tenant/chatbot')
        }
      ];
    } else {
      return [
        ...baseItems,
        { 
          icon: Shield, 
          label: "Meine Tickets", 
          path: '/weg-owner/reports',
          active: location.pathname.startsWith('/weg-owner/reports')
        },
        { 
          icon: Newspaper, 
          label: "Schwarzes Brett", 
          path: '/weg-owner/forum',
          active: location.pathname.startsWith('/weg-owner/forum')
        },
        { 
          icon: Sparkles, 
          label: "Chat", 
          path: '/weg-owner/chatbot',
          active: location.pathname.startsWith('/weg-owner/chatbot')
        }
      ];
    }
  };

  const navigationItems = getNavigationItems();

  return (
    <header className="bg-white border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between h-16 px-4">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <img 
              src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" 
              alt="RGI Immobilien Logo" 
              className="h-14 w-auto object-contain"
            />
          </div>

          {/* Navigation Items */}
          <nav className="flex items-center gap-1">
            {navigationItems.map((item) => (
              <Button
                key={item.path}
                variant={item.active ? "default" : "ghost"}
                size="sm"
                onClick={() => navigate(item.path)}
                className={`gap-2 rounded-lg ${
                  item.active 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Button>
            ))}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg">
              <UserRound className="w-4 h-4 text-muted-foreground" />
              <div className="body-text text-sm">
                <div className="heading-primary font-semibold">{profile?.first_name || 'Benutzer'}</div>
                <div className="body-secondary text-xs">
                  {userRole === 'tenant' ? 'Mieter' : 'WEG-Eigentümer'}
                </div>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(userRole === 'tenant' ? '/tenant/settings' : '/weg-owner/settings')}
              className="rounded-lg"
            >
              <Settings className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-muted-foreground hover:text-destructive rounded-lg"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};