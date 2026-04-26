 import { useState, useEffect } from "react";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { useAuth } from "@/hooks/useAuth";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "@/hooks/use-toast";
import { Building2 } from "lucide-react";
import { LegalDocumentsSheet } from "@/components/LegalDocumentsSheet";
import { OwnerSelfServiceSection } from "@/components/owner/OwnerSelfServiceSection";
 
 interface WegOwnerBuilding {
   id: string;
   building_id: string;
   created_at: string;
 }
 
 export const WegOwnerSettings = () => {
   const { profile, updatePassword } = useAuth();
   const [currentPassword, setCurrentPassword] = useState("");
   const [newPassword, setNewPassword] = useState("");
   const [confirmPassword, setConfirmPassword] = useState("");
   const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
   const [buildings, setBuildings] = useState<WegOwnerBuilding[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [legalSheetOpen, setLegalSheetOpen] = useState(false);
   const [legalSheetTab, setLegalSheetTab] = useState<"agb" | "datenschutz">("agb");
 
   const openLegalSheet = (tab: "agb" | "datenschutz") => {
     setLegalSheetTab(tab);
     setLegalSheetOpen(true);
   };
 
   useEffect(() => {
     if (profile?.user_id) {
       fetchBuildingAssignments();
     }
   }, [profile?.user_id]);
 
   const fetchBuildingAssignments = async () => {
     try {
       setIsLoading(true);
       const { data: assignments, error: assignmentsError } = await supabase
         .from("weg_owner_buildings")
         .select("id, building_id, created_at")
         .eq("user_id", profile?.user_id)
         .order("created_at", { ascending: false });
 
       if (assignmentsError) throw assignmentsError;
 
       if (!assignments || assignments.length === 0) {
         setBuildings([]);
         return;
       }
 
       const buildingIds = assignments.map(a => a.building_id);
       const { data: buildingsData, error: buildingsError } = await supabase
         .from("buildings")
         .select("id, name, address, building_code")
         .in("id", buildingIds);
 
       if (buildingsError) throw buildingsError;
 
       const combinedData = assignments.map(assignment => {
         const building = buildingsData?.find(b => b.id === assignment.building_id);
         return { ...assignment, buildings: building };
       });
 
       setBuildings(combinedData);
     } catch (error: any) {
       console.error("Error fetching building assignments:", error);
       toast({
         title: "Fehler",
         description: "Gebäude-Zuordnungen konnten nicht geladen werden.",
         variant: "destructive",
       });
     } finally {
       setIsLoading(false);
     }
   };
 
   const handlePasswordChange = async () => {
     if (!currentPassword || !newPassword || !confirmPassword) {
       toast({
         title: "Fehler",
         description: "Bitte füllen Sie alle Felder aus.",
         variant: "destructive",
       });
       return;
     }
 
     if (newPassword !== confirmPassword) {
       toast({
         title: "Fehler",
         description: "Die neuen Passwörter stimmen nicht überein.",
         variant: "destructive",
       });
       return;
     }
 
     if (newPassword.length < 6) {
       toast({
         title: "Fehler",
         description: "Das neue Passwort muss mindestens 6 Zeichen lang sein.",
         variant: "destructive",
       });
       return;
     }
 
     setIsUpdatingPassword(true);
     try {
       await updatePassword(newPassword);
       setCurrentPassword("");
       setNewPassword("");
       setConfirmPassword("");
       toast({
         title: "Erfolg",
         description: "Passwort wurde erfolgreich geändert.",
       });
     } catch (error: any) {
       toast({
         title: "Fehler",
         description: error.message || "Passwort konnte nicht geändert werden.",
         variant: "destructive",
       });
     } finally {
       setIsUpdatingPassword(false);
     }
   };
 
   return (
     <div className="max-w-4xl mx-auto space-y-6 p-4">
       <div className="mb-6">
         <h1 className="text-2xl font-bold text-foreground">Einstellungen</h1>
         <p className="text-muted-foreground">Verwalten Sie Ihre Kontodaten und Gebäude-Zuordnungen</p>
       </div>
      <OwnerSelfServiceSection />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Gebäude-Verwaltung
          </CardTitle>
           <CardDescription>
             Ihre zugeordneten Gebäude. Zuordnungen werden durch die Verwaltung vorgenommen.
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           {isLoading ? (
             <div className="text-center py-4">
               <p className="text-muted-foreground">Laden...</p>
             </div>
           ) : buildings.length === 0 ? (
             <div className="text-center py-8 border border-dashed rounded-lg">
               <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
               <p className="text-muted-foreground">Noch keine Gebäude zugeordnet</p>
               <p className="text-sm text-muted-foreground mt-2">
                 Wenden Sie sich an die Verwaltung, um Gebäude zugeordnet zu bekommen.
               </p>
             </div>
           ) : (
             <div className="space-y-2">
               {buildings.map((building) => (
                 <div key={building.id} className="flex items-center justify-between p-3 border rounded-lg">
                   <div className="flex items-center gap-3">
                     <Building2 className="w-4 h-4 text-muted-foreground" />
                     <div className="flex flex-col">
                       <span className="font-medium">{(building as any).buildings?.name || 'Unbekanntes Gebäude'}</span>
                       <span className="text-sm text-muted-foreground">{(building as any).buildings?.address}</span>
                       
                     </div>
                   </div>
                 </div>
               ))}
             </div>
           )}
         </CardContent>
       </Card>
 
       <Card>
         <CardHeader>
           <CardTitle>Passwort ändern</CardTitle>
           <CardDescription>
             Ändern Sie Ihr Anmeldepasswort für mehr Sicherheit.
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           <div className="space-y-2">
             <Label htmlFor="current-password">Aktuelles Passwort</Label>
             <Input
               id="current-password"
               type="password"
               value={currentPassword}
               onChange={(e) => setCurrentPassword(e.target.value)}
             />
           </div>
           <div className="space-y-2">
             <Label htmlFor="new-password">Neues Passwort</Label>
             <Input
               id="new-password"
               type="password"
               value={newPassword}
               onChange={(e) => setNewPassword(e.target.value)}
             />
           </div>
           <div className="space-y-2">
             <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
             <Input
               id="confirm-password"
               type="password"
               value={confirmPassword}
               onChange={(e) => setConfirmPassword(e.target.value)}
             />
           </div>
           <Button 
             onClick={handlePasswordChange} 
             disabled={isUpdatingPassword}
             className="w-full"
           >
             {isUpdatingPassword ? "Wird geändert..." : "Passwort ändern"}
           </Button>
         </CardContent>
       </Card>
 
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