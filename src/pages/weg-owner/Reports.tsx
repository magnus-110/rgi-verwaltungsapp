import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, AlertCircle } from "lucide-react";

export const WegOwnerReports = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    building_id: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.title || !formData.description) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive",
      });
      return;
    }

    try {
      // TODO: Implement Supabase insert
      toast({
        title: "Meldung erstellt",
        description: "Ihre Meldung wurde erfolgreich erstellt.",
      });
      
      setFormData({ title: "", description: "", priority: "medium", building_id: "" });
      setIsCreating(false);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Beim Erstellen der Meldung ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  };

  const mockReports = [
    {
      id: "1",
      title: "Heizungsausfall in Wohnung 12",
      description: "Die Heizung ist seit 2 Tagen defekt",
      status: "open",
      priority: "high",
      created_at: "2024-01-15T10:00:00Z"
    },
    {
      id: "2",
      title: "Wasserschaden im Keller",
      description: "Wasser tritt aus dem Hauptrohr aus",
      status: "in_progress",
      priority: "high",
      created_at: "2024-01-14T15:30:00Z"
    }
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-600";
      case "medium": return "text-yellow-600";
      case "low": return "text-green-600";
      default: return "text-gray-600";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-red-100 text-red-800";
      case "in_progress": return "bg-yellow-100 text-yellow-800";
      case "closed": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (isCreating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Neue Meldung erstellen</h1>
          <Button variant="outline" onClick={() => setIsCreating(false)}>
            Zurück
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Meldungsdetails</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Kurze Beschreibung des Problems"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Beschreibung *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detaillierte Beschreibung des Problems"
                  rows={4}
                  required
                />
              </div>

              <div>
                <Label htmlFor="priority">Priorität</Label>
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Niedrig</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="high">Hoch</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="building_id">Gebäude-ID (optional)</Label>
                <Input
                  id="building_id"
                  value={formData.building_id}
                  onChange={(e) => setFormData({ ...formData, building_id: e.target.value })}
                  placeholder="Falls bekannt, geben Sie Ihre Gebäude-ID ein"
                />
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Meldung erstellen
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>
                  Abbrechen
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Meine Meldungen</h1>
        <Button onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Neue Meldung
        </Button>
      </div>

      <div className="space-y-4">
        {mockReports.map((report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <AlertCircle className={`w-5 h-5 mt-0.5 ${getPriorityColor(report.priority)}`} />
                  <div>
                    <CardTitle className="text-lg">{report.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {new Date(report.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                  {report.status === 'open' ? 'Offen' : 
                   report.status === 'in_progress' ? 'In Bearbeitung' : 
                   'Geschlossen'}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{report.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {mockReports.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Keine Meldungen vorhanden</h3>
            <p className="text-muted-foreground mb-4">
              Sie haben noch keine Meldungen erstellt.
            </p>
            <Button onClick={() => setIsCreating(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Erste Meldung erstellen
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};