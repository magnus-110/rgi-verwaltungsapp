 import { useState, useEffect } from "react";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { useAuth } from "@/hooks/useAuth";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "@/hooks/use-toast";
 import { User, Lock } from "lucide-react";
 import { LegalDocumentsSheet } from "@/components/LegalDocumentsSheet";
 import { PasskeysSection } from "@/components/settings/PasskeysSection";
 
 export const TenantSettings = () => {
   const { profile, updatePassword } = useAuth();
   const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
   const [building, setBuilding] = useState<any>(null);
   const [isLoading, setIsLoading] = useState(true);
   const [passwordForm, setPasswordForm] = useState({
     currentPassword: "",
     newPassword: "",
     confirmPassword: "",
   });
   const [legalSheetOpen, setLegalSheetOpen] = useState(false);
   const [legalSheetTab, setLegalSheetTab] = useState<"agb" | "datenschutz">("agb");
 
   const openLegalSheet = (tab: "agb" | "datenschutz") => {
     setLegalSheetTab(tab);
     setLegalSheetOpen(true);
   };
 
   useEffect(() => {
     if (profile?.user_id) {
       fetchBuildingInfo();
     }
   }, [profile?.user_id]);
 
   const fetchBuildingInfo = async () => {
     try {
       let buildingId = null;
       
       if ((profile as any)?.building_id) {
         buildingId = (profile as any).building_id;
       } else {
         const { data: tenantData, error: tenantError } = await supabase
           .from("tenants")
           .select("building_id")
           .eq("user_id", profile?.user_id)
           .maybeSingle();
           
         if (!tenantError && tenantData) {
           buildingId = tenantData.building_id;
         }
       }
       
       if (buildingId) {
         const { data: buildingData, error: buildingError } = await supabase
           .from("buildings")
           .select("id, name, address")
           .eq("id", buildingId)
           .maybeSingle();
           
         if (!buildingError && buildingData) {
           setBuilding(buildingData);
         }
       }
     } catch (error) {
       console.error("Error fetching building info:", error);
     } finally {
       setIsLoading(false);
     }
   };
 
   const changePassword = async () => {
     if (passwordForm.newPassword !== passwordForm.confirmPassword) {
       toast({
         title: "Fehler",
         description: "Die neuen Passwörter stimmen nicht überein.",
         variant: "destructive",
       });
       return;
     }
 
     if (passwordForm.newPassword.length < 6) {
       toast({
         title: "Fehler",
         description: "Das neue Passwort muss mindestens 6 Zeichen lang sein.",
         variant: "destructive",
       });
       return;
     }
 
     setIsUpdatingPassword(true);
     try {
       const { error } = await updatePassword(passwordForm.newPassword);
       if (error) throw error;
       setPasswordForm({
         currentPassword: "",
         newPassword: "",
         confirmPassword: "",
       });
     } catch (error: any) {
       console.error("Error updating password:", error);
     } finally {
       setIsUpdatingPassword(false);
     }
   };
 
   return (
     <div className="max-w-4xl mx-auto space-y-6 p-4">
       <div className="space-y-2">
         <h1 className="text-4xl font-bold tracking-tight">Einstellungen</h1>
         <p className="text-lg text-muted-foreground">
           Verwalten Sie Ihre Profil- und Kontoeinstellungen
         </p>
       </div>
 
       <Card>
         <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <User className="h-5 w-5" />
             Gebäude-Verwaltung
           </CardTitle>
           <CardDescription>
             Informationen zu Ihrem zugewiesenen Gebäude
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           {isLoading ? (
             <p className="text-muted-foreground">Lade Gebäudeinformationen...</p>
           ) : building ? (
             <div className="space-y-2">
               <div>
                 <Label className="text-sm font-medium">Gebäude</Label>
                 <p className="text-sm text-muted-foreground">{building.name}</p>
               </div>
               <div>
                 <Label className="text-sm font-medium">Adresse</Label>
                 <p className="text-sm text-muted-foreground">{building.address}</p>
               </div>
             </div>
           ) : (
             <p className="text-muted-foreground">Kein Gebäude zugewiesen.</p>
           )}
         </CardContent>
       </Card>
 
       <Card>
         <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <Lock className="h-5 w-5" />
             Passwort ändern
           </CardTitle>
           <CardDescription>
             Ändern Sie Ihr Passwort für erhöhte Sicherheit
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           <div>
             <Label htmlFor="newPassword">Neues Passwort</Label>
             <Input
               id="newPassword"
               type="password"
               value={passwordForm.newPassword}
               onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
               placeholder="Mindestens 6 Zeichen"
             />
           </div>
           
           <div>
             <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
             <Input
               id="confirmPassword"
               type="password"
               value={passwordForm.confirmPassword}
               onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
               placeholder="Passwort wiederholen"
             />
           </div>
 
           <Button 
             onClick={changePassword} 
             disabled={isUpdatingPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
             className="w-full md:w-auto"
           >
             {isUpdatingPassword ? "Wird geändert..." : "Passwort ändern"}
           </Button>
         </CardContent>
        </Card>
 
        <PasskeysSection />
 
        <div className="flex justify-center gap-4 pt-4 pb-8">
         <button 
           onClick={() => openLegalSheet("agb")}
           className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
         >
           AGB
         </button>
         <span className="text-xs text-muted-foreground">|</span>
         <button 
           onClick={() => openLegalSheet("datenschutz")}
           className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
         >
           Datenschutz
         </button>
       </div>
 
       <LegalDocumentsSheet 
         open={legalSheetOpen} 
         onOpenChange={setLegalSheetOpen}
         defaultTab={legalSheetTab}
       />
     </div>
   );
 };