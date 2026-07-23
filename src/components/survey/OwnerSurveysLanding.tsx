import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerVisibleSurveys } from "@/hooks/useSurvey";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ClipboardList } from "lucide-react";

export default function OwnerSurveysLanding() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data = [], isLoading } = useOwnerVisibleSurveys(profile?.user_id);

  if (isLoading) return <div className="p-6 text-muted-foreground">Lädt …</div>;

  if (!data.length) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center space-y-3">
        <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Aktuell laufen keine Umfragen</h1>
        <p className="text-muted-foreground">Sobald Ihre Verwaltung eine Umfrage veröffentlicht, erscheint sie hier.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Aktive Umfragen</h1>
      <p className="text-muted-foreground text-sm">
        Sie haben {data.length} laufende Umfrage{data.length === 1 ? "" : "n"}. Pro Gebäude eine eigene Karte.
      </p>
      {data.map((s) => {
        const pct = s.total_items > 0 ? Math.round((s.answered_items / s.total_items) * 100) : 0;
        const done = s.total_items > 0 && s.answered_items >= s.total_items;
        return (
          <Card key={s.id} className="cursor-pointer hover:border-primary transition"
            onClick={() => navigate(`/weg-owner/umfrage/${s.id}`)}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary truncate">{s.building_name ?? "—"}</div>
                  <div className="font-semibold text-lg leading-tight">{s.title}</div>
                  {s.description && <div className="text-sm text-muted-foreground line-clamp-2 mt-1">{s.description}</div>}
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{s.answered_items} von {s.total_items} beantwortet</span>
                  {s.closes_at && <span>bis {new Date(s.closes_at).toLocaleDateString("de-DE")}</span>}
                </div>
                <Progress value={pct} />
              </div>
              <div className="flex items-center gap-2">
                {done ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Abgeschlossen — Antworten ändern</Badge>
                      : s.answered_items > 0 ? <Badge variant="secondary">Fortsetzen</Badge>
                      : <Badge>Jetzt starten</Badge>}
                <Button size="sm" variant="ghost" className="ml-auto">Öffnen →</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
