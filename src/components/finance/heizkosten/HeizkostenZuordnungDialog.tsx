/**
 * Zuordnung Nutzernummer ↔ Einheit
 * ================================
 *
 * Die Nummerierung des Messdienstleisters stimmt nicht mit der Einheitennummer
 * der App überein. In der Rudolfstr. 2e sind alle sechs Einheiten paarweise
 * vertauscht — ohne geprüfte Zuordnung bekäme jeder Bewohner die Abrechnung
 * seines Nachbarn.
 *
 * Automatisch erkannte Zuordnungen bleiben deshalb Vorschlag. Erst wenn ein
 * Mensch sie bestätigt hat, lässt sich eine Abrechnung freigeben.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, CircleAlert, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  speichereZuordnung, useHeizkostenAktualisieren, useZuordnungen,
  type AnlageZeile, type EinheitDerApp, type ZuordnungZeile,
} from './heizkostenQueries';

interface Props {
  anlage: AnlageZeile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KEINE = '__keine__';

export function HeizkostenZuordnungDialog({ anlage, open, onOpenChange }: Props) {
  const { data, isLoading } = useZuordnungen(open ? anlage : null);
  const aktualisieren = useHeizkostenAktualisieren();
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => { if (!open) setEntwurf({}); }, [open]);

  const zuordnungen = data?.zuordnungen ?? [];
  const einheiten = data?.einheiten ?? [];

  /** Welche Einheit ist gerade gewählt — Entwurf schlägt Gespeichertes. */
  const gewaehlt = (z: ZuordnungZeile) => entwurf[z.id] ?? z.assignment_id ?? KEINE;

  /** Eine Einheit darf nur einmal vergeben werden. */
  const doppelt = useMemo(() => {
    const zaehler = new Map<string, number>();
    for (const z of zuordnungen) {
      const w = gewaehlt(z);
      if (w !== KEINE) zaehler.set(w, (zaehler.get(w) ?? 0) + 1);
    }
    return new Set(Array.from(zaehler.entries()).filter(([, n]) => n > 1).map(([id]) => id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zuordnungen, entwurf]);

  const einheitZu = (id: string): EinheitDerApp | undefined => einheiten.find((e) => e.id === id);

  async function bestaetigen(z: ZuordnungZeile) {
    const wahl = gewaehlt(z);
    if (wahl === KEINE) {
      toast.error('Bitte zuerst eine Einheit auswählen.');
      return;
    }
    if (doppelt.has(wahl)) {
      toast.error('Diese Einheit ist bereits einer anderen Nutzernummer zugeordnet.');
      return;
    }
    setSpeichert(true);
    try {
      const e = einheitZu(wahl);
      await speichereZuordnung(z.id, wahl, e?.unit_number ?? null, true);
      aktualisieren();
      toast.success(`Nutzernummer ${z.provider_user_no} bestätigt.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSpeichert(false);
    }
  }

  async function alleVorschlaegeBestaetigen() {
    const offen = zuordnungen.filter((z) => z.confidence === 'vorschlag' && z.assignment_id);
    if (offen.length === 0) return;
    setSpeichert(true);
    try {
      for (const z of offen) {
        const e = einheitZu(z.assignment_id!);
        await speichereZuordnung(z.id, z.assignment_id, e?.unit_number ?? null, true);
      }
      aktualisieren();
      toast.success(`${offen.length} Vorschläge bestätigt.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSpeichert(false);
    }
  }

  const offeneVorschlaege = zuordnungen.filter((z) => z.confidence === 'vorschlag' && z.assignment_id).length;
  const bestaetigt = zuordnungen.filter((z) => z.confidence === 'bestaetigt').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zuordnung der Nutzernummern — {anlage?.name}</DialogTitle>
          <DialogDescription>
            Links steht, wie der Messdienstleister die Wohnungen nummeriert, rechts die Einheit
            in der App. Die Nummern stimmen häufig nicht überein. Bestätigen Sie jede Zeile
            einzeln — geprüft wird über Name, Lage und Fläche, nicht über die Nummer.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Zuordnungen werden geladen …
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline">{bestaetigt} von {zuordnungen.length} bestätigt</Badge>
              {offeneVorschlaege > 0 && (
                <Button size="sm" variant="outline" disabled={speichert} onClick={alleVorschlaegeBestaetigen}>
                  {speichert ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-2 h-3.5 w-3.5" />}
                  Alle {offeneVorschlaege} Vorschläge bestätigen
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Nr.</TableHead>
                    <TableHead>Nutzer laut Messdienst</TableHead>
                    <TableHead>Lage</TableHead>
                    <TableHead className="min-w-[260px]">Einheit in der App</TableHead>
                    <TableHead className="w-[130px]">Stand</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zuordnungen.map((z) => {
                    const wahl = gewaehlt(z);
                    const istDoppelt = wahl !== KEINE && doppelt.has(wahl);
                    return (
                      <TableRow key={z.id}>
                        <TableCell className="font-mono text-xs">{z.provider_user_no}</TableCell>
                        <TableCell className="text-sm">{z.provider_user_name ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {z.provider_location ?? z.provider_external_no ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={wahl}
                            onValueChange={(v) => setEntwurf((d) => ({ ...d, [z.id]: v }))}
                          >
                            <SelectTrigger className={istDoppelt ? 'border-destructive' : undefined}>
                              <SelectValue placeholder="Einheit wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={KEINE}>— keine Zuordnung —</SelectItem>
                              {einheiten.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.unit_number ? `${e.unit_number} · ` : ''}{e.name}
                                  {e.qm ? ` · ${e.qm.toLocaleString('de-DE')} m²` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {istDoppelt && (
                            <p className="mt-1 text-xs text-destructive">
                              Diese Einheit ist bereits vergeben.
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {z.confidence === 'bestaetigt' && (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              <Check className="mr-1 h-3 w-3" /> bestätigt
                            </Badge>
                          )}
                          {z.confidence === 'vorschlag' && (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">
                              <CircleAlert className="mr-1 h-3 w-3" /> Vorschlag
                            </Badge>
                          )}
                          {z.confidence === 'unbestaetigt' && (
                            <Badge variant="outline" className="text-muted-foreground">
                              <TriangleAlert className="mr-1 h-3 w-3" /> offen
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={z.confidence === 'bestaetigt' ? 'ghost' : 'default'}
                            disabled={speichert || istDoppelt}
                            onClick={() => bestaetigen(z)}
                          >
                            {z.confidence === 'bestaetigt' ? 'Ändern' : 'Bestätigen'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
