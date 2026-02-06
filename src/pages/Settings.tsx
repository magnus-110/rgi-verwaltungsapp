
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Edit, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AdminUser {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface EmployeeUser {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export const Settings = () => {
  const { profile, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [phone, setPhone] = useState((profile as any)?.phone || "");
  const [isLoading, setIsLoading] = useState(false);
  
  // Admin creation states
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminFirstName, setNewAdminFirstName] = useState("");
  const [newAdminLastName, setNewAdminLastName] = useState("");
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  
  // Admin management states
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [editAdminData, setEditAdminData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: ""
  });

  // Employee management states
  const [employeeUsers, setEmployeeUsers] = useState<EmployeeUser[]>([]);
  const [newEmployeeEmail, setNewEmployeeEmail] = useState("");
  const [newEmployeeFirstName, setNewEmployeeFirstName] = useState("");
  const [newEmployeeLastName, setNewEmployeeLastName] = useState("");
  const [newEmployeePhone, setNewEmployeePhone] = useState("");
  const [newEmployeePassword, setNewEmployeePassword] = useState("");
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeUser | null>(null);
  const [editEmployeeData, setEditEmployeeData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: ""
  });

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchAdminUsers();
      fetchEmployeeUsers();
    }
  }, [profile]);

  const fetchAdminUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .eq("role", "admin")
        .order("first_name");

      if (error) throw error;
      setAdminUsers(data || []);
    } catch (error) {
      console.error("Error fetching admin users:", error);
    }
  };

  const fetchEmployeeUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .eq("role", "employee")
        .order("first_name");

      if (error) throw error;
      setEmployeeUsers(data || []);
    } catch (error) {
      console.error("Error fetching employee users:", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone,
        })
        .eq("user_id", profile.user_id);

      if (error) throw error;

      toast.success("Profil erfolgreich aktualisiert");
      await fetchProfile();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Fehler beim Aktualisieren des Profils");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminPassword || !newAdminFirstName || !newAdminLastName) {
      toast.error("Bitte füllen Sie alle Felder aus");
      return;
    }

    setIsCreatingAdmin(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const requestData = {
        email: newAdminEmail,
        password: newAdminPassword,
        role: 'admin',
        first_name: newAdminFirstName,
        last_name: newAdminLastName,
        phone: newAdminPhone || undefined
      };
      
      console.log('Creating admin user with data:', requestData);

      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: requestData,
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      console.log('Full admin creation response:', { data, error });

      if (error) {
        console.error('Admin creation failed:', error);
        let errorMessage = "Fehler beim Erstellen des Admins";
        
        if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
          errorMessage = JSON.stringify(error);
        }
        
        toast.error(errorMessage);
        return;
      }

      if (data?.error) {
        console.error('Admin creation returned error:', data.error);
        toast.error(data.error);
        return;
      }

      if (data?.success) {
        if (data?.password) {
          toast.success(`${data.message || 'Admin erfolgreich erstellt'}! Passwort: ${data.password}`, {
            duration: 8000
          });
        } else if (data?.userAlreadyExists) {
          toast.success(data.message || 'Admin-Rolle wurde erfolgreich zugewiesen');
        } else {
          toast.success(data.message || 'Admin erfolgreich erstellt');
        }
      } else {
        toast.success("Admin erfolgreich verarbeitet");
      }
      
      setNewAdminEmail("");
      setNewAdminFirstName("");
      setNewAdminLastName("");
      setNewAdminPhone("");
      setNewAdminPassword("");
      fetchAdminUsers(); // Refresh the admin list
    } catch (error: any) {
      console.error("Unexpected error creating admin:", error);
      toast.error(`Unerwarteter Fehler: ${error?.message || 'Unbekannter Fehler'}`);
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleEditAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editAdminData.first_name,
          last_name: editAdminData.last_name,
          email: editAdminData.email,
          phone: editAdminData.phone || null
        })
        .eq("user_id", editingAdmin.user_id);

      if (error) throw error;

      toast.success("Admin erfolgreich aktualisiert");
      setEditingAdmin(null);
      fetchAdminUsers();
    } catch (error) {
      console.error("Error updating admin:", error);
      toast.error("Fehler beim Aktualisieren des Admins");
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!confirm("Sind Sie sicher, dass Sie diesen Admin löschen möchten?")) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: adminId },
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Admin erfolgreich gelöscht");
      fetchAdminUsers();
    } catch (error: any) {
      console.error("Error deleting admin:", error);
      toast.error(error?.message || "Fehler beim Löschen des Admins");
    }
  };

  // Employee management functions
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeEmail || !newEmployeePassword || !newEmployeeFirstName || !newEmployeeLastName) {
      toast.error("Bitte füllen Sie alle Felder aus");
      return;
    }

    setIsCreatingEmployee(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const requestData = {
        email: newEmployeeEmail,
        password: newEmployeePassword,
        role: 'employee',
        first_name: newEmployeeFirstName,
        last_name: newEmployeeLastName,
        phone: newEmployeePhone || undefined
      };
      
      console.log('Creating employee user with data:', requestData);

      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: requestData,
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      console.log('Full employee creation response:', { data, error });

      if (error) {
        console.error('Employee creation failed:', error);
        let errorMessage = "Fehler beim Erstellen des Mitarbeiters";
        
        if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
          errorMessage = JSON.stringify(error);
        }
        
        toast.error(errorMessage);
        return;
      }

      if (data?.error) {
        console.error('Employee creation returned error:', data.error);
        toast.error(data.error);
        return;
      }

      if (data?.success) {
        if (data?.password) {
          toast.success(`${data.message || 'Mitarbeiter erfolgreich erstellt'}! Passwort: ${data.password}`, {
            duration: 8000
          });
        } else if (data?.userAlreadyExists) {
          toast.success(data.message || 'Mitarbeiter-Rolle wurde erfolgreich zugewiesen');
        } else {
          toast.success(data.message || 'Mitarbeiter erfolgreich erstellt');
        }
      } else {
        toast.success("Mitarbeiter erfolgreich verarbeitet");
      }
      
      setNewEmployeeEmail("");
      setNewEmployeeFirstName("");
      setNewEmployeeLastName("");
      setNewEmployeePhone("");
      setNewEmployeePassword("");
      fetchEmployeeUsers();
    } catch (error: any) {
      console.error("Unexpected error creating employee:", error);
      toast.error(`Unerwarteter Fehler: ${error?.message || 'Unbekannter Fehler'}`);
    } finally {
      setIsCreatingEmployee(false);
    }
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editEmployeeData.first_name,
          last_name: editEmployeeData.last_name,
          email: editEmployeeData.email
        })
        .eq("user_id", editingEmployee.user_id);

      if (error) throw error;

      toast.success("Mitarbeiter erfolgreich aktualisiert");
      setEditingEmployee(null);
      fetchEmployeeUsers();
    } catch (error) {
      console.error("Error updating employee:", error);
      toast.error("Fehler beim Aktualisieren des Mitarbeiters");
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm("Sind Sie sicher, dass Sie diesen Mitarbeiter löschen möchten?")) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: employeeId },
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Mitarbeiter erfolgreich gelöscht");
      fetchEmployeeUsers();
    } catch (error: any) {
      console.error("Error deleting employee:", error);
      toast.error(error?.message || "Fehler beim Löschen des Mitarbeiters");
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Einstellungen</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre persönlichen Einstellungen
          </p>
        </div>

        <div className="grid gap-6">
          {/* Persönliche Informationen - Nicht für Admins anzeigen */}
          {profile.role !== 'admin' && (
            <Card>
              <CardHeader>
                <CardTitle>Persönliche Informationen</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">Vorname</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Ihr Vorname"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Nachname</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Ihr Nachname"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="email">E-Mail</Label>
                    <Input
                      id="email"
                      value={profile.email}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Die E-Mail-Adresse kann nicht geändert werden
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefon</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ihre Telefonnummer"
                    />
                  </div>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Speichern..." : "Änderungen speichern"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}


          {/* Passwort ändern */}
          <Card>
            <CardHeader>
              <CardTitle>Passwort</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => {
                if (profile.role === 'admin') {
                  navigate('/admin/change-password');
                } else if (profile.role === 'weg_owner') {
                  navigate('/weg-owner/change-password');
                } else if (profile.role === 'tenant') {
                  navigate('/tenant/change-password');
                } else {
                  navigate('/change-password');
                }
              }}>
                Passwort ändern
              </Button>
            </CardContent>
          </Card>

          {/* Admin Management - nur für Admins */}
          {profile.role === 'admin' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5" />
                    Administrator erstellen
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateAdmin} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="newAdminFirstName">Vorname</Label>
                        <Input
                          id="newAdminFirstName"
                          value={newAdminFirstName}
                          onChange={(e) => setNewAdminFirstName(e.target.value)}
                          placeholder="Vorname des neuen Admins"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="newAdminLastName">Nachname</Label>
                        <Input
                          id="newAdminLastName"
                          value={newAdminLastName}
                          onChange={(e) => setNewAdminLastName(e.target.value)}
                          placeholder="Nachname des neuen Admins"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="newAdminEmail">E-Mail</Label>
                      <Input
                        id="newAdminEmail"
                        type="email"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        placeholder="E-Mail des neuen Admins"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="newAdminPassword">Temporäres Passwort</Label>
                      <Input
                        id="newAdminPassword"
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        placeholder="Temporäres Passwort"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Der neue Admin sollte das Passwort nach der ersten Anmeldung ändern
                      </p>
                    </div>
                    <Button type="submit" disabled={isCreatingAdmin}>
                      {isCreatingAdmin ? "Erstellen..." : "Admin erstellen"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Administrator verwalten</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {adminUsers.map((admin) => (
                      <div key={admin.user_id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="font-medium">
                            {admin.first_name && admin.last_name 
                              ? `${admin.first_name} ${admin.last_name}`
                              : admin.email
                            }
                          </div>
                          <div className="text-sm text-muted-foreground">{admin.email}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingAdmin(admin);
                              setEditAdminData({
                                first_name: admin.first_name || "",
                                last_name: admin.last_name || "",
                                email: admin.email
                              });
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteAdmin(admin.user_id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    {adminUsers.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        Keine Administrator-Accounts gefunden
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Employee Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5" />
                    Mitarbeiter erstellen
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateEmployee} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="newEmployeeFirstName">Vorname</Label>
                        <Input
                          id="newEmployeeFirstName"
                          value={newEmployeeFirstName}
                          onChange={(e) => setNewEmployeeFirstName(e.target.value)}
                          placeholder="Vorname des neuen Mitarbeiters"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="newEmployeeLastName">Nachname</Label>
                        <Input
                          id="newEmployeeLastName"
                          value={newEmployeeLastName}
                          onChange={(e) => setNewEmployeeLastName(e.target.value)}
                          placeholder="Nachname des neuen Mitarbeiters"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="newEmployeeEmail">E-Mail</Label>
                      <Input
                        id="newEmployeeEmail"
                        type="email"
                        value={newEmployeeEmail}
                        onChange={(e) => setNewEmployeeEmail(e.target.value)}
                        placeholder="E-Mail des neuen Mitarbeiters"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="newEmployeePassword">Temporäres Passwort</Label>
                      <Input
                        id="newEmployeePassword"
                        type="password"
                        value={newEmployeePassword}
                        onChange={(e) => setNewEmployeePassword(e.target.value)}
                        placeholder="Temporäres Passwort"
                        required
                      />
                    </div>
                    <Button type="submit" disabled={isCreatingEmployee}>
                      {isCreatingEmployee ? "Erstellen..." : "Mitarbeiter erstellen"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mitarbeiter verwalten</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {employeeUsers.map((employee) => (
                      <div key={employee.user_id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="font-medium">
                            {employee.first_name && employee.last_name 
                              ? `${employee.first_name} ${employee.last_name}`
                              : employee.email
                            }
                          </div>
                          <div className="text-sm text-muted-foreground">{employee.email}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingEmployee(employee);
                              setEditEmployeeData({
                                first_name: employee.first_name || "",
                                last_name: employee.last_name || "",
                                email: employee.email
                              });
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteEmployee(employee.user_id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    {employeeUsers.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        Keine Mitarbeiter-Accounts gefunden
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Edit Admin Dialog */}
        <Dialog open={!!editingAdmin} onOpenChange={() => setEditingAdmin(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Administrator bearbeiten</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditAdmin} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editFirstName">Vorname</Label>
                  <Input
                    id="editFirstName"
                    value={editAdminData.first_name}
                    onChange={(e) => setEditAdminData(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="Vorname"
                  />
                </div>
                <div>
                  <Label htmlFor="editLastName">Nachname</Label>
                  <Input
                    id="editLastName"
                    value={editAdminData.last_name}
                    onChange={(e) => setEditAdminData(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Nachname"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="editEmail">E-Mail</Label>
                <Input
                  id="editEmail"
                  type="email"
                  value={editAdminData.email}
                  onChange={(e) => setEditAdminData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="E-Mail"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setEditingAdmin(null)}>
                  Abbrechen
                </Button>
                <Button type="submit">
                  Speichern
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Employee Dialog */}
        <Dialog open={!!editingEmployee} onOpenChange={() => setEditingEmployee(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mitarbeiter bearbeiten</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditEmployee} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editEmployeeFirstName">Vorname</Label>
                  <Input
                    id="editEmployeeFirstName"
                    value={editEmployeeData.first_name}
                    onChange={(e) => setEditEmployeeData(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="Vorname"
                  />
                </div>
                <div>
                  <Label htmlFor="editEmployeeLastName">Nachname</Label>
                  <Input
                    id="editEmployeeLastName"
                    value={editEmployeeData.last_name}
                    onChange={(e) => setEditEmployeeData(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Nachname"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="editEmployeeEmail">E-Mail</Label>
                <Input
                  id="editEmployeeEmail"
                  type="email"
                  value={editEmployeeData.email}
                  onChange={(e) => setEditEmployeeData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="E-Mail"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setEditingEmployee(null)}>
                  Abbrechen
                </Button>
                <Button type="submit">
                  Speichern
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
