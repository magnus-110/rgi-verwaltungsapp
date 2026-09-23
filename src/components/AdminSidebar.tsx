import React, { useState } from "react";
import {
  BarChart3,
  ClipboardList,
  ListChecks,
  Castle,
  Settings,
  LogOut,
  ToggleLeft,
  ToggleRight,
  CheckSquare,
  CalendarDays,
  BookUser,
  Landmark,
  Mail,
  Users,
  CreditCard,
  Workflow,
  FolderKanban,
  Briefcase,
  Home,
  KeyRound,
  StickyNote,
  CalendarRange,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
import { useOpenReportsCount } from "@/hooks/useOpenReportsCount";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  children?: MenuItem[];
}

/**
 * "Aufgaben" fasst die vier Bereiche zusammen, die zusammengehören: die
 * Pinnwand mit den Aufgaben, die Vorgänge, der Jahreszyklus und die
 * Anleitungen. Vorher standen sie einzeln und weit auseinander in der Liste.
 */
const adminMenu: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Postfach", url: "/postfach", icon: Mail },
  { title: "Gebäude", url: "/buildings", icon: Castle },
  {
    title: "Aufgaben",
    url: "/pinnwand",
    icon: CheckSquare,
    children: [
      { title: "Pinnwand", url: "/pinnwand", icon: StickyNote },
      { title: "Vorgänge", url: "/vorgaenge", icon: FolderKanban },
      { title: "Jahreszyklus", url: "/jahreszyklus", icon: CalendarRange },
      { title: "Anleitungen", url: "/checklisten", icon: Workflow },
    ],
  },
  { title: "Buchhaltung", url: "/finanzen", icon: Landmark },
  { title: "Zahlungen", url: "/zahlungen", icon: CreditCard },
  { title: "Adressen", url: "/contacts", icon: BookUser },
  { title: "Kalender", url: "/calendar", icon: CalendarDays },
  { title: "Meldungen", url: "/tickets", icon: ClipboardList },
  { title: "Versammlungen", url: "/versammlungen", icon: Users },
  { title: "Schlüssel", url: "/schluessel", icon: KeyRound },
  { title: "Umfragen", url: "/umfragen", icon: ListChecks },
  { title: "RGI Intern", url: "/rgi-intern", icon: Briefcase, adminOnly: true },
  { title: "Einstellungen", url: "/settings", icon: Settings, adminOnly: true },
];

/** Gehört dieser Pfad zu einem der Unterpunkte von "Aufgaben"? */
function istAufgabenPfad(pfad: string) {
  return (
    pfad.startsWith("/pinnwand") ||
    pfad.startsWith("/vorgaenge") ||
    pfad.startsWith("/jahreszyklus") ||
    pfad.startsWith("/checklisten") ||
    pfad.startsWith("/prozesse") ||
    pfad.startsWith("/tickets/vorgaenge")
  );
}

const brokerMenu: MenuItem[] = [
  { title: "Objekte", url: "/makler/objekte", icon: Home },
  { title: "Postfach", url: "/postfach", icon: Mail },
  { title: "Adressen", url: "/contacts", icon: BookUser },
  { title: "Kalender", url: "/calendar", icon: CalendarDays },
  { title: "Einstellungen", url: "/settings", icon: Settings, adminOnly: true },
];

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

  const { brokerMode, setBrokerMode, brokerSectionOpen, setBrokerSectionOpen } = useBrokerMode();
  const brokerEnabled = !!profile?.broker_mode_enabled;
  const isBrokerActive = brokerEnabled && brokerMode !== null;

  const menuItems = isBrokerActive ? brokerMenu : adminMenu;
  const openReportsCount = useOpenReportsCount(!isBrokerActive);

  // Aufgeklappt, sobald man in einem der Unterpunkte steht. Danach darf man
  // es zuklappen, ohne dass es beim nächsten Klick wieder aufspringt.
  const [aufgabenOffen, setAufgabenOffen] = useState(() => istAufgabenPfad(currentPath));

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

        {/* Verwaltungsmodus */}
        <div className="p-4 border-b border-border">
          {!collapsed ? (
            <div className="space-y-3">
              <label className="label-text text-xs uppercase tracking-wider text-muted-foreground">
                Verwaltungsmodus
              </label>
              <div className="flex bg-muted rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { onModeChange('weg'); setBrokerMode(null); }}
                  className={`flex-1 rounded-md transition-colors ${
                    !isBrokerActive && managementMode === 'weg'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-background text-muted-foreground'
                  }`}
                >
                  WEG
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { onModeChange('rent'); setBrokerMode(null); }}
                  className={`flex-1 rounded-md transition-colors ${
                    !isBrokerActive && managementMode === 'rent'
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

        {/* Makler-Modus (nur sichtbar wenn freigeschaltet) */}
        {brokerEnabled && !collapsed && (
          <div className="p-4 border-b border-border">
            <button
              type="button"
              onClick={() => setBrokerSectionOpen(!brokerSectionOpen)}
              className="w-full flex items-center justify-between mb-3 group"
            >
              <label className="label-text text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                Makler
              </label>
              {brokerSectionOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
              )}
            </button>
            {brokerSectionOpen && (
              <div className="flex bg-muted rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBrokerMode('rent');
                    navigate('/makler/objekte');
                  }}
                  className={`flex-1 rounded-md transition-colors ${
                    isBrokerActive && brokerMode === 'rent'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-background text-muted-foreground'
                  }`}
                >
                  Vermietung
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBrokerMode('sale');
                    navigate('/makler/objekte');
                  }}
                  className={`flex-1 rounded-md transition-colors ${
                    isBrokerActive && brokerMode === 'sale'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-background text-muted-foreground'
                  }`}
                >
                  Verkauf
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Navigation Menu */}
        <SidebarGroup className="px-4 flex-1">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems
                .filter((item) => {
                  if ((item as any).adminOnly && profile?.role !== 'admin') return false;
                  if (profile?.role === 'employee') {
                    return !['Chatbot', 'Einstellungen'].includes(item.title);
                  }
                  return true;
                })
                .map((item) => {
                  // Gruppe mit Unterpunkten ("Aufgaben").
                  if (item.children) {
                    const gruppeAktiv = istAufgabenPfad(currentPath);
                    return (
                      <SidebarMenuItem key={item.title}>
                        {collapsed ? (
                          <NavLink
                            to={item.url}
                            className={
                              gruppeAktiv
                                ? "bg-primary text-white flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                                : "text-foreground hover:bg-muted flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                            }
                            title={item.title}
                          >
                            <item.icon className="h-4 w-4" />
                          </NavLink>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setAufgabenOffen((o) => !o)}
                              aria-expanded={aufgabenOffen}
                              className={
                                gruppeAktiv && !aufgabenOffen
                                  ? "bg-primary text-white w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                                  : "text-foreground hover:bg-muted w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                              }
                            >
                              <div className="relative flex-shrink-0 mr-3">
                                <item.icon className="h-4 w-4" />
                              </div>
                              {/*
                                label-text setzt selbst text-foreground und
                                ueberschreibt damit das geerbte Weiss. Auf dem
                                orangen Grund muss die Schrift hier also noch
                                einmal ausdruecklich weiss gesetzt werden.
                              */}
                              <span
                                className={`label-text flex-1 text-left ${
                                  gruppeAktiv && !aufgabenOffen ? "text-white" : ""
                                }`}
                              >
                                {item.title}
                              </span>
                              {aufgabenOffen ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {aufgabenOffen && (
                              <div className="mt-1 ml-4 space-y-1 border-l border-border pl-3">
                                {item.children.map((kind) => {
                                  const kindAktiv =
                                    kind.url === "/checklisten"
                                      ? currentPath.startsWith("/checklisten") ||
                                        currentPath.startsWith("/prozesse")
                                      : currentPath.startsWith(kind.url);
                                  return (
                                    <NavLink
                                      key={kind.url}
                                      to={kind.url}
                                      className={
                                        kindAktiv
                                          ? "bg-primary text-white flex items-center px-3 py-2 text-sm rounded-md transition-colors"
                                          : "text-foreground hover:bg-muted flex items-center px-3 py-2 text-sm rounded-md transition-colors"
                                      }
                                    >
                                      <kind.icon className="h-4 w-4 flex-shrink-0 mr-3" />
                                      <span
                                        className={`label-text flex-1 ${
                                          kindAktiv ? "text-white" : ""
                                        }`}
                                      >
                                        {kind.title}
                                      </span>
                                    </NavLink>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </SidebarMenuItem>
                    );
                  }

                  let aliasActive = false;
                  if (item.url === "/tickets") {
                    aliasActive =
                      currentPath === "/tickets" ||
                      currentPath === "/reports" ||
                      currentPath === "/admin/reports";
                  } else if (item.url === "/checklisten") {
                    aliasActive = currentPath.startsWith("/checklisten") || currentPath.startsWith("/prozesse");
                  } else if (item.url === "/vorgaenge") {
                    aliasActive = currentPath.startsWith("/vorgaenge") || currentPath.startsWith("/tickets/vorgaenge");
                  } else if (item.url === "/makler/objekte") {
                    aliasActive = currentPath.startsWith("/makler");
                  } else if (item.url === "/schluessel") {
                    aliasActive = currentPath.startsWith("/schluessel");
                  }
                  return (
                    <SidebarMenuItem key={item.title}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/tickets"}
                        className={({ isActive }) =>
                          (isActive || aliasActive)
                            ? "bg-primary text-white group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                            : "text-foreground hover:bg-muted hover:text-foreground group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors"
                        }
                      >
                        {({ isActive }) => {
                          const showBadge = item.url === "/tickets" && openReportsCount > 0;
                          const badgeLabel = openReportsCount > 99 ? "99+" : String(openReportsCount);
                          return (
                            <>
                              <div className="relative flex-shrink-0 mr-3">
                                <item.icon className="h-4 w-4" />
                                {showBadge && collapsed && (
                                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                                )}
                              </div>
                              {!collapsed && (
                                <span className={`label-text flex-1 ${(isActive || aliasActive) ? 'text-white' : ''}`}>
                                  {item.title}
                                </span>
                              )}
                              {!collapsed && showBadge && (
                                <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-white text-xs font-semibold">
                                  {badgeLabel}
                                </span>
                              )}
                            </>
                          );
                        }}
                      </NavLink>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
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
