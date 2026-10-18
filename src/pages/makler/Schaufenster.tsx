import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ArrowDown, ArrowUp, Check, Plus, Save, Trash2 } from 'lucide-react';

import { useDisplayConfig } from '@/hooks/useSchaufenster';
import DisplayPreview from '@/components/schaufenster/DisplayPreview';
import DisplaySlideEditor from '@/components/schaufenster/DisplaySlideEditor';
import DisplayPropertyOrder from '@/components/schaufenster/DisplayPropertyOrder';
import { DisplaySlide, SLIDE_LABELS, SlideKind, slideSummary } from '@/lib/schaufenster';

const NEUE_ARTEN: SlideKind[] = ['objekte', 'referenzen', 'bereich', 'stimme', 'app', 'auftakt', 'frei'];

const AdminDisplay: React.FC = () => {
  const { profile } = useAuth();
  if (profile && profile.role !== 'admin' && !(profile as any).broker_mode_enabled) return <Navigate to="/dashboard" replace />;
  return <SchaufensterInhalt />;
};

const SchaufensterInhalt: React.FC = () => {
  const {
    slides, settings, loading, saving, tabellenFehlen,
    folieSpeichern, folieAnlegen, folieLoeschen, reihenfolgeSpeichern, einstellungenSpeichern,
  } = useDisplayConfig();

  const [auswahlId, setAuswahlId] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<DisplaySlide | null>(null);
  const [neueArt, setNeueArt] = useState<SlideKind>('bereich');

  // Erste Folie automatisch auswählen
  useEffect(() => {
    if (!auswahlId && slides.length) setAuswahlId(slides[0].id);
  }, [slides, auswahlId]);

  // Entwurf auf die ausgewählte Folie setzen
  useEffect(() => {
    const s = slides.find((x) => x.id === auswahlId) || null;
    setEntwurf(s ? { ...s, config: { ...s.config } } : null);
  }, [auswahlId, slides]);

  const gespeichert = useMemo(() => {
    const original = slides.find((s) => s.id === auswahlId);
    if (!original || !entwurf) return true;
    return JSON.stringify(original) === JSON.stringify(entwurf);
  }, [slides, auswahlId, entwurf]);

  // Ohne useMemo entstünde bei jedem Rendern ein neues Objekt und die
  // Vorschau bekäme laufend Nachrichten geschickt.
  const vorschauFolie = useMemo(
    () => (entwurf ? { kind: entwurf.kind, config: entwurf.config } : null),
    [entwurf],
  );

  const standardDauer = entwurf && (entwurf.kind === 'objekte' || entwurf.kind === 'referenzen')
    ? settings.object_duration_seconds
    : settings.content_duration_seconds;

  const verschieben = (index: number, richtung: -1 | 1) => {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= slides.length) return;
    const neu = [...slides];
    [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
    reihenfolgeSpeichern(neu);
  };

  const anlegen = async () => {
    const neu = await folieAnlegen(neueArt);
    if (neu) setAuswahlId(neu.id);
  };

  const loeschen = async (id: string) => {
    const ok = await folieLoeschen(id);
    if (ok && auswahlId === id) setAuswahlId(null);
  };

  if (tabellenFehlen) {
    return (
      <div className="max-w-3xl p-4 md:p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Schaufensterbildschirm</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 space-y-2">
          <p className="font-medium">Das Schaufenster ist noch nicht in die App umgezogen.</p>
          <p>
            Bis dahin läuft der Bildschirm unverändert mit seinem Standardablauf weiter – es geht
            also nichts verloren.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Schaufensterbildschirm</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ablauf, Texte und Reihenfolge der Anzeige im Schaufenster.
          </p>
        </div>
        {saving && (
          <Badge variant="outline" className="text-primary border-primary/30">
            wird gespeichert …
          </Badge>
        )}
      </div>

      <Tabs defaultValue="ablauf">
        <TabsList>
          <TabsTrigger value="ablauf">Ablauf</TabsTrigger>
          <TabsTrigger value="objekte">Objektreihenfolge</TabsTrigger>
          <TabsTrigger value="einstellungen">Einstellungen</TabsTrigger>
        </TabsList>

        {/* ---------------- Ablauf ---------------- */}
        <TabsContent value="ablauf" className="mt-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Folienliste */}
            <div className="xl:col-span-3 space-y-3">
              <Card>
                <CardContent className="p-3">
                  {loading ? (
                    <p className="text-sm text-gray-500 py-6 text-center">Wird geladen …</p>
                  ) : (
                    <div className="space-y-1">
                      {slides.map((s, i) => (
                        <div
                          key={s.id}
                          className={`group flex items-center gap-1.5 rounded-lg px-2 py-2 cursor-pointer transition-colors ${
                            s.id === auswahlId ? 'bg-primary/10' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setAuswahlId(s.id)}
                        >
                          <div className="flex flex-col">
                            <Button
                              variant="ghost" size="icon" className="h-5 w-5"
                              onClick={(e) => { e.stopPropagation(); verschieben(i, -1); }}
                              disabled={i === 0} aria-label="Nach oben"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-5 w-5"
                              onClick={(e) => { e.stopPropagation(); verschieben(i, 1); }}
                              disabled={i === slides.length - 1} aria-label="Nach unten"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </Button>
                          </div>

                          <div className={`min-w-0 flex-1 ${s.is_active ? '' : 'opacity-45'}`}>
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {SLIDE_LABELS[s.kind]}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{slideSummary(s)}</p>
                          </div>

                          {!s.is_active && (
                            <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                              Pause
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-3 space-y-2">
                  <Label className="text-xs font-medium text-gray-600">Folie hinzufügen</Label>
                  <Select value={neueArt} onValueChange={(v) => setNeueArt(v as SlideKind)}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white z-50">
                      {NEUE_ARTEN.map((k) => (
                        <SelectItem key={k} value={k}>{SLIDE_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button className="w-full" variant="outline" onClick={anlegen} disabled={saving}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Anlegen
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Editor */}
            <div className="xl:col-span-5">
              <Card>
                <CardContent className="p-5">
                  {entwurf ? (
                    <>
                      <DisplaySlideEditor
                        slide={entwurf}
                        onChange={setEntwurf}
                        standardDauer={standardDauer}
                      />

                      <div className="flex items-center gap-3 mt-8 pt-5 border-t border-gray-100">
                        <Button
                          onClick={() => folieSpeichern(entwurf)}
                          disabled={gespeichert || saving}
                          className="bg-primary hover:bg-primary/90"
                        >
                          {gespeichert
                            ? <><Check className="w-4 h-4 mr-1.5" />Gespeichert</>
                            : <><Save className="w-4 h-4 mr-1.5" />Speichern</>}
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" className="text-gray-500 hover:text-red-600">
                              <Trash2 className="w-4 h-4 mr-1.5" />
                              Folie löschen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Folie löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                „{SLIDE_LABELS[entwurf.kind]} – {slideSummary(entwurf)}“ wird aus dem
                                Ablauf entfernt. Das lässt sich nicht rückgängig machen.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => loeschen(entwurf.id)}
                              >
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        {!gespeichert && (
                          <span className="text-xs text-gray-500">
                            Noch nicht gespeichert – die Vorschau zeigt den Entwurf.
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 py-12 text-center">
                      Wähle links eine Folie aus oder lege eine neue an.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Vorschau */}
            <div className="xl:col-span-4">
              <div className="xl:sticky xl:top-24">
                <DisplayPreview
                  slide={vorschauFolie}
                  alleSlides={slides}
                  settings={settings}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Objektreihenfolge ---------------- */}
        <TabsContent value="objekte" className="mt-6">
          <DisplayPropertyOrder />
        </TabsContent>

        {/* ---------------- Einstellungen ---------------- */}
        <TabsContent value="einstellungen" className="mt-6">
          <Card className="max-w-xl">
            <CardContent className="p-5 space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Standarddauer einer Objektfolie
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={4} max={120} className="h-11 max-w-[140px]"
                    value={settings.object_duration_seconds}
                    onChange={(e) => einstellungenSpeichern({
                      ...settings,
                      object_duration_seconds: parseInt(e.target.value, 10) || 16,
                    })}
                  />
                  <span className="text-sm text-gray-500">Sekunden</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Standarddauer einer Inhaltsfolie
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={4} max={120} className="h-11 max-w-[140px]"
                    value={settings.content_duration_seconds}
                    onChange={(e) => einstellungenSpeichern({
                      ...settings,
                      content_duration_seconds: parseInt(e.target.value, 10) || 13,
                    })}
                  />
                  <span className="text-sm text-gray-500">Sekunden</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Nur Objekte aus diesem Ort</Label>
                <Input
                  className="h-11"
                  value={settings.city_filter ?? ''}
                  placeholder="Leer lassen für alle Orte"
                  onChange={(e) => einstellungenSpeichern({
                    ...settings,
                    city_filter: e.target.value || null,
                  })}
                />
                <p className="text-xs text-gray-500">
                  Muss genau so geschrieben sein wie im Objekt hinterlegt, z.&nbsp;B. „Pfronten“.
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600 leading-relaxed">
                Änderungen erscheinen innerhalb einer knappen Minute auf dem Bildschirm –
                er fragt alle 30 Sekunden nach, ob sich etwas getan hat.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDisplay;
