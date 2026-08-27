/**
 * Heizkosten — Einstieg
 * =====================
 *
 * Zeigt alle Anlagen mit ihrem Bearbeitungsstand. Ein Klick führt in den
 * Arbeitsbildschirm der Anlage.
 *
 * Die Liste ist bewusst kurz: Wo steht die Abrechnung, was fehlt noch, was ist
 * auffällig. Alles andere gehört in die Anlage selbst.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronRight, Flame, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { HeizkostenAnlage } from './HeizkostenAnlage';
import { ENERGIE_LABEL, useAnlagenUebersicht, type AnlageStatus } from './heizkostenQueries';

interface Props {
  sharedBuildingId: string | null;
  sharedPeriodId: string | null;
  fiscalYear: number;
}

export function HeizkostenTab({ sharedBuildingId, sharedPeriodId, fiscalYear }: Props) {
  const [gewaehlt, setGewaehlt] = useState<AnlageStatus | null>(null);
  const { data: anlagen = [], isLoading } = useAnlagenUebersicht(sharedBuildingId);

  // Zeitraum aus der gewählten Abrechnungsperiode, sonst das Kalenderjahr.
  const { data: periode } = useQuery({
    queryKey: ['heizkosten-periode', sharedPeriodId],
    enabled: !!sharedPeriodId,
    queryFn: async () => {
      const { data } = await supabase
        .from('billing_periods')
        .select('period_from, period_to')
        .eq('id', sharedPeriodId!)
        .maybeSingle();
      return data;
    },
  });

  const periodFrom = periode?.period_from ?? `${fiscalYear}-01-01`;
  const periodTo = periode?.period_to ?? `${fiscalYear}-12-31`;

  const summe = useMemo(() => ({
    anlagen: anlagen.length,
    bereit: anlagen.filter((a) => a.bestaetigt === a.nutzeinheiten && a.nutzeinheiten > 0).length,
    offeneZuordnungen: anlagen.reduce((s, a) => s + (a.nutzeinheiten - a.bestaetigt), 0),
    ohneFaktor: anlagen.reduce((s, a) => s + a.geraeteOhneFaktor, 0),
  }), [anlagen]);

  if (gewaehlt) {
    const aktuell = anlagen.find((a) => a.id === gewaehlt.id) ?? gewaehlt;
    return (
      <HeizkostenAnlage
        anlage={aktuell}
        periodFrom={periodFrom}
        periodTo={periodTo}
        fiscalYear={fiscalYear}
        billingPeriodId={sharedPeriodId}
        onZurueck={() => setGewaehlt(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kennzahl titel="Anlagen" wert={String(summe.anlagen)} zusatz={`${summe.bereit} vollständig zugeordnet`} />
        <Kennzahl titel="Offene Zuordnungen" wert={String(summe.offeneZuordnungen)} zusatz="Nutzernummern ohne Bestätigung" betont={summe.offeneZuordnungen > 0} />
        <Kennzahl titel="Geräte ohne Faktor" wert={String(summe.ohneFaktor)} zusatz="Bewertungsfaktor fehlt" betont={summe.ohneFaktor > 0} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            Liegenschaften
            <span className="text-sm font-normal text-muted-foreground">
              · Zeitraum {periodFrom.split('-').reverse().join('.')} – {periodTo.split('-').reverse().join('.')}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Anlagen werden geladen …
            </div>
          ) : anlagen.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              Für dieses Gebäude ist noch keine Heizungsanlage angelegt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Liegenschaft</TableHead>
                    <TableHead>Anbieter</TableHead>
                    <TableHead>Energie</TableHead>
                    <TableHead className="text-right">Einheiten</TableHead>
                    <TableHead className="text-right">Geräte</TableHead>
                    <TableHead>Stand</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anlagen.map((a) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer"
                      onClick={() => setGewaehlt(a)}
                    >
                      <TableCell>
                        <p className="font-medium">{a.name}</p>
                        {a.provider_property_no && (
                          <p className="font-mono text-xs text-muted-foreground">{a.provider_property_no}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.provider ?? '—'}</TableCell>
                      <TableCell className="text-sm">{ENERGIE_LABEL[a.energy_source] ?? a.energy_source}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{a.nutzeinheiten}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{a.geraete}</TableCell>
                      <TableCell><StandBadge anlage={a} /></TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Die Ablesung bleibt beim Messdienstleister. Hier entsteht nur die Rechnung — und sie
        verändert erst dann etwas an der Jahresabrechnung, wenn sie ausdrücklich übergeben wird.
      </p>
    </div>
  );
}

function StandBadge({ anlage }: { anlage: AnlageStatus }) {
  if (anlage.letzterLauf?.status === 'freigegeben') {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">freigegeben</Badge>;
  }
  if (anlage.geraete === 0) {
    return <Badge variant="outline" className="text-muted-foreground">kein Gerätestamm</Badge>;
  }
  if (anlage.geraeteOhneFaktor > 0) {
    return <Badge variant="outline" className="border-destructive/40 text-destructive">
      {anlage.geraeteOhneFaktor} Faktoren fehlen
    </Badge>;
  }
  if (anlage.bestaetigt < anlage.nutzeinheiten) {
    return <Badge variant="outline" className="border-amber-300 text-amber-700">
      {anlage.nutzeinheiten - anlage.bestaetigt} Zuordnungen offen
    </Badge>;
  }
  if (anlage.ablesungen === 0) {
    return <Badge variant="outline" className="text-muted-foreground">wartet auf Ablesung</Badge>;
  }
  if (anlage.letzterLauf?.status === 'gerechnet') {
    return <Badge className="bg-primary/10 text-primary hover:bg-primary/10">gerechnet</Badge>;
  }
  return <Badge variant="outline">bereit</Badge>;
}

function Kennzahl({ titel, wert, zusatz, betont }: {
  titel: string; wert: string; zusatz: string; betont?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titel}</p>
        <p className={`mt-1 font-mono text-2xl ${betont ? 'text-primary' : ''}`}>{wert}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{zusatz}</p>
      </CardContent>
    </Card>
  );
}
