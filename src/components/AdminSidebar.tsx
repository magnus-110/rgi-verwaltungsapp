import React from "react";
import { LogOut } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ModusSchalter } from "@/components/broker/ModusSchalter";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useBrokerMode } from "@/hooks/useBrokerMode";
import { abschnittsweise, adminMenu, brokerMenu, istAktiv, menueFuer } from "@/lib/adminNavigation";
import { useReportCounts, useReportsLive } from "@/hooks/useReports";

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

  const { brokerActive: isBrokerActive } = useBrokerMode();

  const menuItems = isBrokerActive ? brokerMenu : adminMenu;
  // Abzeichen am Postfach: neue Meldungen, für die noch niemand zuständig ist.
  useReportsLive("sidebar", !isBrokerActive);
  const { data: reportCounts } = useReportCounts(!isBrokerActive);
  const openReportsCount = isBrokerActive ? 0 : reportCounts?.open ?? 0;

  const handleSignOut = async () => { await signOut(); };

  return (
    <Sidebar className={`${collapsed ? "w-16" : "w-64"} border-r border-border`}>
      <SidebarContent className="bg-background">
        {/* Logo */}
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

        {/* Bereich: WEG · Miete · Makler */}
        <div className={collapsed ? "py-3 border-b border-border" : "p-4 border-b border-border"}>
          {!collapsed && (
            <label className="label-text text-xs uppercase tracking-wider text-muted-foreground block mb-3">
              Bereich
            </label>
          )}
          <ModusSchalter managementMode={managementMode} onModeChange={onModeChange} kompakt={collapsed} />
        </div>

        {/* Navigation: fünf Zwischenüberschriften (Umbau 15.10.2026) */}
        <SidebarGroup className="px-4 flex-1">
          <SidebarGroupContent>
            <nav aria-label="Hauptnavigation">
              {abschnittsweise(
                menueFuer(profile?.role, menuItems, isBrokerActive ? undefined : managementMode),
              ).map((gruppe, gi) => (
                <div key={gruppe.abschnitt ?? `oben-${gi}`} className={gi > 0 ? "mt-3" : ""}>
                  {gruppe.abschnitt && (
                    collapsed ? (
                      <div className="mx-2 mb-2 border-t border-border" aria-hidden="true" />
                    ) : (
                      <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {gruppe.abschnitt}
                      </div>
                    )
                  )}
                  <SidebarMenu className="space-y-0.5">
                    {gruppe.items.map((item) => {
                      // Welche Pfade zu welchem Punkt gehören, steht in
                      // adminNavigation — damit die mobile Ansicht dasselbe
                      // hervorhebt wie die Seitenleiste.
                      const aktiv = istAktiv(item, currentPath);
                      const showBadge = item.url === "/postfach" && openReportsCount > 0;
                      const badgeLabel = openReportsCount > 99 ? "99+" : String(openReportsCount);
                      return (
                        <SidebarMenuItem key={item.url}>
                          <NavLink
                            to={item.url}
                            title={collapsed ? item.title : undefined}
                            className={
                              aktiv
                                ? "bg-primary text-white group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
                                : "text-foreground hover:bg-muted hover:text-foreground group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
                            }
                          >
                            <div className="relative flex-shrink-0 mr-3">
                              <item.icon className="h-4 w-4" />
                              {showBadge && collapsed && (
                                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                              )}
                            </div>
                            {!collapsed && (
                              <span className={`label-text flex-1 ${aktiv ? "text-white" : ""}`}>
                                {item.title}
                              </span>
                            )}
                            {!collapsed && showBadge && (
                              <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-white text-xs font-semibold">
                                {badgeLabel}
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </div>
              ))}
            </nav>
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
