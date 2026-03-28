import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Calendar, MapPin, Building2, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export const EtvProxy = () => {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["etv-proxy", token],
    queryFn: async () => {
      if (!token) throw new Error("Kein Token angegeben");

      // Find attendee by proxy token
      const { data: attendee, error: attErr } = await supabase
        .from("etv_attendees")
        .select(`
          id, proxy_external_name, proxy_token_used, attendance_type, proxy_type,
          etv_meetings!inner(
            id, title, meeting_date, location, status,
            buildings!inner(name, address)
          )
        `)
        .eq("proxy_token", token)
        .maybeSingle();

      if (attErr) throw attErr;
      if (!attendee) throw new Error("INVALID_TOKEN");

      return attendee;
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    const isInvalid = (error as any)?.message === "INVALID_TOKEN";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">
              {isInvalid ? "Ungültiger Link" : "Fehler"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isInvalid
                ? "Dieser Vollmacht-Link ist ungültig oder wurde zurückgezogen. Bitte kontaktieren Sie den Eigentümer, der Ihnen die Vollmacht erteilt hat."
                : "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const meeting = (data as any).etv_meetings;
  const building = meeting?.buildings;
  const meetingDate = new Date(meeting.meeting_date);
  const isCompleted = meeting.status === "completed";
  const isActive = meeting.status === "in_progress";

  return (
    <div className="min-h-screen bg-background p-4 flex items-start justify-center pt-12">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <Shield className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Vollmacht zur Eigentümerversammlung</h1>
          {data.proxy_external_name && (
            <p className="text-muted-foreground">
              Bevollmächtigt: <strong>{data.proxy_external_name}</strong>
            </p>
          )}
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{building?.name}</span>
            </div>
            {building?.address && (
              <p className="text-xs text-muted-foreground ml-6">{building.address}</p>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {format(meetingDate, "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}
              </span>
            </div>
            {meeting.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{meeting.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant={isActive ? "default" : isCompleted ? "secondary" : "outline"}>
                {isActive ? "Läuft gerade" : isCompleted ? "Abgeschlossen" : "Geplant"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center space-y-2">
            <h2 className="font-semibold">{meeting.title}</h2>
            {isActive ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Die Versammlung läuft. Ihre Vollmacht ist aktiv — die Abstimmung erfolgt über das Versammlungstool der Hausverwaltung.
                </p>
              </div>
            ) : isCompleted ? (
              <p className="text-sm text-muted-foreground">
                Diese Versammlung ist bereits abgeschlossen.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Die Versammlung hat noch nicht begonnen. Sie wurden als Bevollmächtigter benannt und können an der Abstimmung teilnehmen, sobald die Versammlung gestartet wird.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Dieser Link wurde Ihnen von einem Eigentümer übermittelt. Bei Fragen wenden Sie sich bitte an die zuständige Hausverwaltung.
        </p>
      </div>
    </div>
  );
};
