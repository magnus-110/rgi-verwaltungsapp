/**
 * Heizkostenabrechnung einer Anlage — der Arbeitsbildschirm
 * ========================================================
 *
 * Ein Bildschirm statt eines Assistenten: oben die Eingaben, in der Mitte was
 * die App daraus gemacht hat, rechts die Hinweise, unten der Knopf.
 *
 * Der Verwalter tut hier drei Dinge — Ablesewerte eintragen oder hochladen,
 * die Hinweise ansehen, freigeben. Alles andere holt sich die App selbst: die
 * Kosten aus der Buchhaltung, den Gerätestamm, die Zuordnungen.
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, Calculator, Check, CircleAlert, Flame, Info, Loader2, Save,
  Send, TriangleAlert, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { rechneAbrechnung } from '@/lib/heizkosten';
import {
  ladeEingang, speichereErgebnis, uebergebeAnJahresabrechnung,
} from '@/lib/heizkosten/daten';
import {
  pruefeBewertungsfaktoren, pruefeEichung,
} from '@/lib/heizkosten/pruefungen';
import type { AbrechnungErgebnis, Pruefhinweis } from '@/lib/heizkosten/typen';

import { HeizkostenZuordnungDialog } from './HeizkostenZuordnungDialog';
import {
  ENERGIE_LABEL, GERAETEART_EINHEIT, GERAETEART_LABEL, eurFormat, zahlFormat,
  speichereAblesungen, useGeraeteMitAblesung, useHeizkostenAktualisieren,
  useZuordnungen, type AblesungEingabe, type AnlageStatus,
} from './heizkostenQueries';

interface Props {
  anlage: AnlageStatus;
  periodFrom: string;
  periodTo: string;
  fiscalYear: number;
  billingPeriodId: string | null;
  onZurueck: () => void;
}

export function HeizkostenAnlage({
  anlage, periodFrom, periodTo, fiscalYear, billingPeriodId, onZurueck,
}: Props) {
  const aktualisieren = useHeizkostenAktualisieren();
  const { data: stamm, isLoading } = useGeraeteMitAblesung(anlage.id, periodFrom, periodTo);
  const { data: zuord } = useZuordnungen(anlage);

  const [werte, setWerte] = useState<Record<string, { vor: string; jetzt: string }>>({});
  const [trennungWw, setTrennungWw] = useState('');
  const [trennungGesamt, setTrennungGesamt] = useState('');
  const [co2Kg, setCo2Kg] = useState('');
  const [co2Kosten, setCo2Kosten] = useState('');
  const [ergebnis, setErgebnis] = useState<AbrechnungErgebnis | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [zuordnungOffen, setZuordnungOffen] = useState(false);

  const geraete = useMemo(() => stamm?.geraete ?? [], [stamm]);
  const ablesungen = useMemo(() => stamm?.ablesungen ?? [], [stamm]);

  // Gespeicherte Ablesewerte in die Eingabefelder übernehmen.
  useEffect(() => {
    const start: Record<string, { vor: string; jetzt: string }> = {};
    for (const a of ablesungen) {
      start[a.device_id] = {
        vor: a.previous_value != null ? String(a.previous_value) : '',
        jetzt: a.current_value != null ? String(a.current_value) : '',
      };
    }
    setWerte(start);
  }, [ablesungen]);

  const nameJeZuordnung = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of zuord?.zuordnungen ?? []) {
      m.set(z.id, `${z.provider_user_no} · ${z.provider_user_name ?? ''}`.trim());
    }
    return m;
  }, [zuord]);

  const geraeteJeEinheit = useMemo(() => {
    const gruppen = new Map<string, typeof geraete>();
    for (const g of geraete) {
      const key = g.mapping_id ?? '__anlage__';
      gruppen.set(key, [...(gruppen.get(key) ?? []), g]);
    }
    return Array.from(gruppen.entries());
  }, [geraete]);

  // ── Prüfungen, die schon vor dem Rechnen möglich sind ────────────────────────
  const stammHinweise: Pruefhinweis[] = useMemo(() => {
    const pruef = geraete.map((g) => ({
      deviceNo: g.device_no,
      deviceType: g.device_type,
      ratingFactor: g.rating_factor,
      ratingFactorSource: g.rating_factor_source,
      calibrationYear: g.calibration_year,
      calibrationValidUntil: g.calibration_valid_until,
      einheit: g.mapping_id ? nameJeZuordnung.get(g.mapping_id) : 'Anlage',
    }));
    return [
      ...pruefeBewertungsfaktoren(pruef),
      ...pruefeEichung(pruef, new Date(periodTo)),
    ];
  }, [geraete, nameJeZuordnung, periodTo]);

  const offeneZuordnungen = anlage.nutzeinheiten - anlage.bestaetigt;
  const alleHinweise = [...stammHinweise, ...(ergebnis?.hinweise ?? [])];
  const kritisch = alleHinweise.filter((h) => h.schwere === 'fehler');

  // ── Aktionen ───────────────────────────────────────────────────

  async function ablesungenSpeichern() {
    const eingaben: AblesungEingabe[] = [];
    for (const g of geraete) {
      const w = werte[g.id];
      if (!w) continue;
      const vor = w.vor.trim() === '' ? null : Number(w.vor.replace(',', '.'));
      const jetzt = w.jetzt.trim() === '' ? null : Number(w.jetzt.replace(',', '.'));
      if (vor == null && jetzt == null) continue;
      if ((vor != null && Number.isNaN(vor)) || (jetzt != null && Number.isNaN(jetzt))) {
        toast.error(`Gerät ${g.device_no}: Der Wert ist keine Zahl.`);
        return;
      }
      eingaben.push({
        deviceId: g.id, previous: vor, current: jetzt,
        isEstimated: false, estimateLevel: null, estimateReason: null,
      });
    }
    setLaeuft(true);
    try {
      await speichereAblesungen(eingaben, periodFrom, periodTo);
      aktualisieren();
      toast.success(`${eingaben.length} Ablesewerte gespeichert.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setLaeuft(false);
    }
  }

  async function rechnen() {
    setLaeuft(true);
    try {
      const geladen = await ladeEingang({
        heatingSystemId: anlage.id, fiscalYear, periodFrom, periodTo,
      });
      const eingang = geladen.eingang;

      // Die Trennung nach § 9 braucht die gemessenen Wärmemengen. Sie stehen
      // auf der Abrechnung des Versorgers, nicht im Gerätestamm.
      const ww = Number(trennungWw.replace(',', '.'));
      const gesamt = Number(trennungGesamt.replace(',', '.'));
      if (eingang.anlage.trennung.art === 'wmz') {
        if (!ww || !gesamt) {
          toast.error('Bitte Warmwasser- und Gesamtwärmemenge eintragen (§ 9 Abs. 2).');
          setLaeuft(false);
          return;
        }
        eingang.anlage.trennung = {
          art: 'wmz', wwWaermemengeKwh: ww, gesamtWaermemengeKwh: gesamt,
        };
      } else if (eingang.anlage.trennung.art === 'formel') {
        if (!gesamt) {
          toast.error('Bitte die gesamte Energiemenge eintragen (§ 9 Abs. 3).');
          setLaeuft(false);
          return;
        }
        eingang.anlage.trennung = { ...eingang.anlage.trennung, gesamtEnergieKwh: gesamt };
      }

      const kg = Number(co2Kg.replace(',', '.'));
      const kosten = Number(co2Kosten.replace(',', '.'));
      if (kg > 0 && kosten > 0) eingang.co2 = { kg, kosten };

      if (eingang.kosten.length === 0) {
        toast.error('Für dieses Jahr sind keine Heizkosten gebucht. Bitte zuerst umbuchen.');
        setLaeuft(false);
        return;
      }

      const e = rechneAbrechnung(eingang);
      e.hinweise = [...stammHinweise, ...e.hinweise];
      setErgebnis(e);

      const { data: user } = await supabase.auth.getUser();
      const id = await speichereErgebnis({
        heatingSystemId: anlage.id,
        buildingId: anlage.building_id,
        billingPeriodId,
        fiscalYear, periodFrom, periodTo,
        eingang, ergebnis: e,
        userId: user?.user?.id ?? null,
      });
      setSettlementId(id);
      aktualisieren();
      toast.success('Abrechnung gerechnet und als Entwurf gespeichert.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Die Rechnung ist fehlgeschlagen.');
    } finally {
      setLaeuft(false);
    }
  }

  async function freigeben() {
    if (!settlementId || !billingPeriodId) return;
    setLaeuft(true);
    try {
      const r = await uebergebeAnJahresabrechnung(settlementId, anlage.building_id, billingPeriodId);
      aktualisieren();
      toast.success(
        `Freigegeben. ${r.geschrieben} Werte stehen in der Jahresabrechnung bereit.`
        + (r.ohneZuordnung > 0 ? ` ${r.ohneZuordnung} Zeilen ohne Zuordnung wurden übersprungen.` : ''),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Freigabe fehlgeschlagen.');
    } finally {
      setLaeuft(false);
    }
  }

  const kannFreigeben = !!ergebnis && !!settlementId && !!billingPeriodId
    && kritisch.length === 0 && offeneZuordnungen === 0;

  // ── Anzeige ────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onZurueck}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Alle Liegenschaften
          </Button>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" /> {anlage.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {anlage.provider ?? 'ohne Anbieter'}
            {anlage.provider_property_no ? ` · Anlage ${anlage.provider_property_no}` : ''}
            {' · '}{ENERGIE_LABEL[anlage.energy_source] ?? anlage.energy_source}
            {' · '}{periodFrom.split('-').reverse().join('.')} – {periodTo.split('-').reverse().join('.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{anlage.geraete} Geräte</Badge>
          <Button
            variant={offeneZuordnungen > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setZuordnungOffen(true)}
          >
            <Users className="mr-1.5 h-4 w-4" />
            {offeneZuordnungen > 0
              ? `${offeneZuordnungen} Zuordnungen offen`
              : 'Zuordnung geprüft'}
          </Button>
        </div>
      </div>

      {offeneZuordnungen > 0 && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <TriangleAlert className="h-4 w-4 flex-none text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Die Zuordnung ist noch nicht vollständig geprüft
            </p>
            <p className="text-amber-800/80 dark:text-amber-300/80">
              Die Nummerierung des Messdienstleisters stimmt oft nicht mit den Einheiten der App
              überein. Solange nicht jede Zeile bestätigt ist, lässt sich die Abrechnung nicht
              freigeben — eine falsche Zuordnung würde jedem Bewohner die Abrechnung eines
              anderen schicken.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Eingaben */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Angaben des Versorgers</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {anlage.separation_method === 'wmz' && (
                <>
                  <Feld label="Warmwasserenergie (kWh)" hinweis="Wärmemengenzähler der Warmwasserbereitung"
                    value={trennungWw} onChange={setTrennungWw} />
                  <Feld label="Gesamtwärme (kWh)" hinweis="Heizung und Warmwasser zusammen"
                    value={trennungGesamt} onChange={setTrennungGesamt} />
                </>
              )}
              {anlage.separation_method === 'formel' && (
                <Feld label="Gesamte Energiemenge (kWh)" hinweis="Grundlage der Formel nach § 9 Abs. 3"
                  value={trennungGesamt} onChange={setTrennungGesamt} />
              )}
              {anlage.separation_method === 'keine' && (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Diese Anlage liefert kein Warmwasser — eine Trennung nach § 9 entfällt.
                </p>
              )}
              <Feld label="CO₂-Menge (kg)" hinweis="aus der Rechnung des Lieferanten"
                value={co2Kg} onChange={setCo2Kg} />
              <Feld label="CO₂-Kosten (€)" hinweis="leer lassen, wenn keine ausgewiesen sind"
                value={co2Kosten} onChange={setCo2Kosten} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Ablesewerte</CardTitle>
              <Button size="sm" variant="outline" disabled={laeuft} onClick={ablesungenSpeichern}>
                {laeuft ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Speichern
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Gerätestamm wird geladen …
                </div>
              ) : geraete.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  Für diese Anlage ist noch kein Gerätestamm hinterlegt.
                </p>
              ) : (
                <div className="space-y-5">
                  {geraeteJeEinheit.map(([key, liste]) => (
                    <div key={key}>
                      <p className="mb-1.5 text-sm font-medium">
                        {key === '__anlage__' ? 'Anlage (Heizungsraum)' : nameJeZuordnung.get(key) ?? 'Ohne Zuordnung'}
                      </p>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[110px]">Gerät</TableHead>
                              <TableHead>Art</TableHead>
                              <TableHead>Raum</TableHead>
                              <TableHead className="text-right w-[90px]">Faktor</TableHead>
                              <TableHead className="w-[130px]">Vorstand</TableHead>
                              <TableHead className="w-[130px]">Ablesung</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {liste.map((g) => (
                              <TableRow key={g.id}>
                                <TableCell className="font-mono text-xs">{g.device_no}</TableCell>
                                <TableCell className="text-xs">
                                  {GERAETEART_LABEL[g.device_type]}
                                  <span className="text-muted-foreground"> · {GERAETEART_EINHEIT[g.device_type]}</span>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{g.room ?? '—'}</TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  {g.device_type === 'hkv'
                                    ? (g.rating_factor != null
                                        ? zahlFormat(g.rating_factor, 2)
                                        : <span className="text-destructive">fehlt</span>)
                                    : '—'}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    className="h-8 text-right font-mono text-xs"
                                    inputMode="decimal"
                                    value={werte[g.id]?.vor ?? ''}
                                    onChange={(ev) => setWerte((w) => ({
                                      ...w, [g.id]: { vor: ev.target.value, jetzt: w[g.id]?.jetzt ?? '' },
                                    }))}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    className="h-8 text-right font-mono text-xs"
                                    inputMode="decimal"
                                    value={werte[g.id]?.jetzt ?? ''}
                                    onChange={(ev) => setWerte((w) => ({
                                      ...w, [g.id]: { vor: w[g.id]?.vor ?? '', jetzt: ev.target.value },
                                    }))}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {ergebnis && <ErgebnisKarte ergebnis={ergebnis} />}
        </div>

        {/* Hinweise und Aktionen */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prüfhinweise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alleHinweise.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine Auffälligkeiten. Die Prüfungen laufen erneut, sobald gerechnet wurde.
                </p>
              ) : (
                alleHinweise.map((h, i) => <HinweisZeile key={i} hinweis={h} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <Button className="w-full" disabled={laeuft} onClick={rechnen}>
                {laeuft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                Abrechnung rechnen
              </Button>
              <Button
                className="w-full"
                variant={kannFreigeben ? 'default' : 'outline'}
                disabled={!kannFreigeben || laeuft}
                onClick={freigeben}
              >
                <Send className="mr-2 h-4 w-4" />
                An die Jahresabrechnung übergeben
              </Button>
              {!billingPeriodId && (
                <p className="text-xs text-muted-foreground">
                  Für die Übergabe muss oben ein Abrechnungszeitraum gewählt sein.
                </p>
              )}
              {kritisch.length > 0 && (
                <p className="text-xs text-destructive">
                  {kritisch.length} kritische{kritisch.length === 1 ? 'r Hinweis' : ' Hinweise'} —
                  eine Freigabe ist erst nach Klärung möglich.
                </p>
              )}
              <Separator />
              <p className="text-xs text-muted-foreground">
                Ein Rechenlauf verändert nichts an der Jahresabrechnung. Erst die Übergabe
                schreibt die Werte auf Konto 1400.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <HeizkostenZuordnungDialog anlage={anlage} open={zuordnungOffen} onOpenChange={setZuordnungOffen} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Bausteine
// ────────────────────────────────────────────────────────────

function Feld({ label, hinweis, value, onChange }: {
  label: string; hinweis?: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <Input
        className="mt-1 h-9 text-right font-mono text-sm"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hinweis && <p className="mt-1 text-xs text-muted-foreground">{hinweis}</p>}
    </div>
  );
}

function HinweisZeile({ hinweis }: { hinweis: Pruefhinweis }) {
  const farbe =
    hinweis.schwere === 'fehler'
      ? 'border-destructive/40 bg-destructive/5'
      : hinweis.schwere === 'warnung'
        ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
        : 'border-border bg-muted/40';
  const Symbol = hinweis.schwere === 'fehler' ? CircleAlert : hinweis.schwere === 'warnung' ? TriangleAlert : Info;
  return (
    <div className={`flex gap-2 rounded-md border p-2.5 text-xs ${farbe}`}>
      <Symbol className="h-3.5 w-3.5 flex-none mt-0.5" />
      <div>
        <p className="font-medium">{hinweis.norm}</p>
        <p className="text-muted-foreground">{hinweis.text}</p>
        {hinweis.betrifft && <p className="mt-0.5 text-muted-foreground/80">Betrifft: {hinweis.betrifft}</p>}
      </div>
    </div>
  );
}

function ErgebnisKarte({ ergebnis }: { ergebnis: AbrechnungErgebnis }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" /> Verteilung auf die Nutzeinheiten
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Kennzahl titel="Heizung" wert={eurFormat(ergebnis.kostenHeizung)} />
          <Kennzahl titel="Warmwasser" wert={eurFormat(ergebnis.kostenWarmwasser)} />
          <Kennzahl titel="Gesamt" wert={eurFormat(ergebnis.kostenGesamt)} betont />
        </div>
        <p className="text-xs text-muted-foreground">{ergebnis.rechenwegTrennung}</p>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Einheit</TableHead>
                <TableHead className="text-right">Fläche</TableHead>
                <TableHead className="text-right">Heizung Grund</TableHead>
                <TableHead className="text-right">Heizung Verbr.</TableHead>
                <TableHead className="text-right">Wasser Grund</TableHead>
                <TableHead className="text-right">Wasser Verbr.</TableHead>
                <TableHead className="text-right">Gesamt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ergebnis.jeEinheit.map((z) => (
                <TableRow key={`${z.einheitId}-${z.zeitraum}`}>
                  <TableCell className="text-xs">
                    <span className="font-mono">{z.einheitId}</span>
                    {z.bezeichnung ? <span className="text-muted-foreground"> · {z.bezeichnung}</span> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{zahlFormat(z.flaecheM2, 2)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{eurFormat(z.heizungGrund)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{eurFormat(z.heizungVerbrauch)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{eurFormat(z.warmwasserGrund)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{eurFormat(z.warmwasserVerbrauch)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold">{eurFormat(z.gesamt)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell className="text-xs font-semibold">Summe</TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-mono text-xs font-semibold">
                  {eurFormat(ergebnis.jeEinheit.reduce((s, z) => s + z.gesamt, 0))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {ergebnis.co2 && (
          <p className="text-xs text-muted-foreground">
            CO₂: {zahlFormat(ergebnis.co2.emissionProM2, 1)} kg je m² und Jahr — Stufe {ergebnis.co2.stufe},
            Anteil Eigentümer {(ergebnis.co2.anteilVermieter * 100).toFixed(0)} % ({eurFormat(ergebnis.co2.kostenVermieter)}).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Kennzahl({ titel, wert, betont }: { titel: string; wert: string; betont?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titel}</p>
      <p className={`mt-0.5 font-mono text-lg ${betont ? 'text-primary font-semibold' : ''}`}>{wert}</p>
    </div>
  );
}
