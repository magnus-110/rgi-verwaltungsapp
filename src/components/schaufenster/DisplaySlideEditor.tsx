import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import {
  DISPLAY_IMAGES, DisplaySlide, QR_OPTIONS, QrTarget, SLIDE_HINTS, SLIDE_LABELS, SlideConfig,
} from '@/lib/schaufenster';

interface DisplaySlideEditorProps {
  slide: DisplaySlide;
  onChange: (slide: DisplaySlide) => void;
  standardDauer: number;
}

const feldKlasse = 'h-11 text-base border-gray-300 focus:border-primary focus:ring-primary/20';

/**
 * Radix lässt bei einem Auswahlfeld keinen leeren Wert zu und wirft
 * dann einen Fehler. „Nichts ausgewählt“ bekommt deshalb einen
 * Platzhalter, der beim Speichern wieder zu einem leeren Wert wird.
 */
const KEINS = '__keins__';
const zuFeld = (v: string | undefined) => (v ? v : KEINS);
const ausFeld = (v: string) => (v === KEINS ? '' : v);

const DisplaySlideEditor: React.FC<DisplaySlideEditorProps> = ({ slide, onChange, standardDauer }) => {
  const c = slide.config || {};

  const setzeConfig = (teil: Partial<SlideConfig>) =>
    onChange({ ...slide, config: { ...c, ...teil } });

  const setzeListe = (name: 'points' | 'features', index: number, wert: string) => {
    const liste = [...(c[name] || [])];
    liste[index] = wert;
    setzeConfig({ [name]: liste } as Partial<SlideConfig>);
  };

  const ergaenzeListe = (name: 'points' | 'features') =>
    setzeConfig({ [name]: [...(c[name] || []), ''] } as Partial<SlideConfig>);

  const entferneListe = (name: 'points' | 'features', index: number) =>
    setzeConfig({ [name]: (c[name] || []).filter((_, i) => i !== index) } as Partial<SlideConfig>);

  const Bildwahl = (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">Bild</Label>
      <Select value={zuFeld(c.image)} onValueChange={(v) => setzeConfig({ image: ausFeld(v) })}>
        <SelectTrigger className={feldKlasse}>
          <SelectValue placeholder="Bitte wählen…" />
        </SelectTrigger>
        <SelectContent className="bg-white z-50">
          {DISPLAY_IMAGES.map((b) => (
            <SelectItem key={b.value || 'leer'} value={zuFeld(b.value)}>{b.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-gray-500">
        Weitere Bilder kommen in den Ordner <code>public/display/</code> und stehen danach hier zur Auswahl.
      </p>
    </div>
  );

  const Kopfzeilen = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Kennzeichnung oben rechts</Label>
        <Input
          className={feldKlasse}
          value={c.pill ?? ''}
          onChange={(e) => setzeConfig({ pill: e.target.value })}
          placeholder="z.B. Unsere Leistungen"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Schlagzeile</Label>
        <Input
          className={feldKlasse}
          value={c.title ?? ''}
          onChange={(e) => setzeConfig({ title: e.target.value })}
          placeholder="z.B. Verkauf"
        />
        <p className="text-xs text-gray-500">
          Kurze Wörter wirken aus der Ferne am stärksten. Lange werden automatisch kleiner gesetzt.
        </p>
      </div>
    </div>
  );

  const Fliesstext = (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">Fließtext</Label>
      <Textarea
        rows={4}
        className="text-base border-gray-300 focus:border-primary focus:ring-primary/20 resize-none"
        value={c.lead ?? ''}
        onChange={(e) => setzeConfig({ lead: e.target.value })}
      />
      <p className="text-xs text-gray-500">
        Erlaubt sind <code>&lt;b&gt;fett&lt;/b&gt;</code> und <code>&lt;br&gt;</code> für einen Umbruch.
      </p>
    </div>
  );

  const ListenFeld = (name: 'points' | 'features', titel: string, hinweis: string) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">{titel}</Label>
      {(c[name] || []).map((wert, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className={feldKlasse}
            value={wert}
            onChange={(e) => setzeListe(name, i, e.target.value)}
          />
          <Button
            type="button" variant="ghost" size="icon"
            onClick={() => entferneListe(name, i)}
            aria-label="Eintrag entfernen"
          >
            <Trash2 className="w-4 h-4 text-gray-400" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => ergaenzeListe(name)}>
        <Plus className="w-4 h-4 mr-1.5" />
        Eintrag hinzufügen
      </Button>
      <p className="text-xs text-gray-500">{hinweis}</p>
    </div>
  );

  const Aufruf = (
    <div className="rounded-lg border border-gray-200 p-4 space-y-4">
      <p className="text-sm font-medium text-gray-900">Aufruf am Fuß der Folie</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">Erste Zeile</Label>
          <Input className={feldKlasse} value={c.cta1 ?? ''}
                 onChange={(e) => setzeConfig({ cta1: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">Zweite Zeile (orange)</Label>
          <Input className={feldKlasse} value={c.cta2 ?? ''}
                 onChange={(e) => setzeConfig({ cta2: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">Dritte Zeile</Label>
          <Input className={feldKlasse} value={c.page ?? ''}
                 onChange={(e) => setzeConfig({ page: e.target.value })}
                 placeholder="rgi-immobilien.de/verkauf" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">QR-Code zeigt auf</Label>
          <Select value={zuFeld(c.qr)} onValueChange={(v) => setzeConfig({ qr: ausFeld(v) as QrTarget })}>
            <SelectTrigger className={feldKlasse}>
              <SelectValue placeholder="Bitte wählen…" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              {QR_OPTIONS.map((o) => (
                <SelectItem key={o.value || 'leer'} value={zuFeld(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Kopf: Art, aktiv, Dauer */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-gray-900">{SLIDE_LABELS[slide.kind]}</p>
            <p className="text-sm text-gray-500 mt-0.5">{SLIDE_HINTS[slide.kind]}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={slide.is_active}
              onCheckedChange={(v) => onChange({ ...slide, is_active: v })}
              aria-label="Folie aktiv"
            />
            <span className="text-sm text-gray-700">{slide.is_active ? 'Läuft' : 'Pausiert'}</span>
          </div>
        </div>

        <div className="space-y-2 max-w-xs">
          <Label className="text-sm font-medium text-gray-700">Anzeigedauer</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={4} max={120}
              className={feldKlasse}
              value={slide.duration_seconds ?? ''}
              placeholder={String(standardDauer)}
              onChange={(e) =>
                onChange({
                  ...slide,
                  duration_seconds: e.target.value === '' ? null : parseInt(e.target.value, 10),
                })
              }
            />
            <span className="text-sm text-gray-500 whitespace-nowrap">Sekunden</span>
          </div>
          <p className="text-xs text-gray-500">Leer lassen für die Standarddauer ({standardDauer} s).</p>
        </div>
      </div>

      {/* Art-abhängige Felder */}
      {slide.kind === 'auftakt' && (
        <>
          {Bildwahl}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Überschrift im Querformat</Label>
            <Input
              className={feldKlasse}
              value={c.title ?? ''}
              onChange={(e) => setzeConfig({ title: e.target.value })}
              placeholder="Damit Sie sich&lt;br&gt;zurücklehnen können."
            />
            <p className="text-xs text-gray-500">
              Im Hochformat wird das Bild randlos gezeigt, die Überschrift steckt bereits darin.
              Diese Zeile greift nur, wenn der Bildschirm quer hängt.
            </p>
          </div>
        </>
      )}

      {slide.kind === 'objekte' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Anzahl Objekte</Label>
            <Input
              type="number" min={1} max={12}
              className={feldKlasse}
              value={c.count ?? 1}
              onChange={(e) => setzeConfig({ count: parseInt(e.target.value, 10) || 1 })}
            />
            <p className="text-xs text-gray-500">
              An dieser Stelle laufen so viele Objekte nacheinander. Beim nächsten Durchgang
              kommen die folgenden an die Reihe.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Nur diese Art</Label>
            <Select
              value={c.transaction ?? 'all'}
              onValueChange={(v) => setzeConfig({ transaction: v as 'all' | 'sale' | 'rent' })}
            >
              <SelectTrigger className={feldKlasse}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white z-50">
                <SelectItem value="all">Verkauf und Vermietung</SelectItem>
                <SelectItem value="sale">Nur Verkauf</SelectItem>
                <SelectItem value="rent">Nur Vermietung</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {slide.kind === 'referenzen' && (
        <div className="space-y-2 max-w-xs">
          <Label className="text-sm font-medium text-gray-700">Anzahl Referenzen</Label>
          <Input
            type="number" min={1} max={12}
            className={feldKlasse}
            value={c.count ?? 1}
            onChange={(e) => setzeConfig({ count: parseInt(e.target.value, 10) || 1 })}
          />
          <p className="text-xs text-gray-500">
            Gezeigt werden Objekte mit Status verkauft oder vermietet, in der Reihenfolge
            aus der Referenzverwaltung.
          </p>
        </div>
      )}

      {slide.kind === 'stimme' && (
        <>
          {Kopfzeilen}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Zitat</Label>
            <Textarea
              rows={5}
              className="text-base border-gray-300 focus:border-primary focus:ring-primary/20 resize-none"
              value={c.text ?? ''}
              onChange={(e) => setzeConfig({ text: e.target.value })}
            />
            <p className="text-xs text-gray-500">
              Ohne Anführungszeichen eingeben – die setzt die Anzeige selbst.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Herkunft</Label>
              <Input
                className={feldKlasse}
                value={c.author ?? ''}
                onChange={(e) => setzeConfig({ author: e.target.value })}
                placeholder="Eigentümer aus Füssen"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Sterne</Label>
              <Input
                type="number" min={0} max={5}
                className={feldKlasse}
                value={c.stars ?? 5}
                onChange={(e) => setzeConfig({ stars: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
          </div>
        </>
      )}

      {(slide.kind === 'bereich' || slide.kind === 'frei') && (
        <>
          {Kopfzeilen}
          {Bildwahl}
          {Fliesstext}
          {ListenFeld('points', 'Nummerierte Punkte', 'Drei Punkte wirken am ruhigsten.')}
          {Aufruf}
        </>
      )}

      {slide.kind === 'app' && (
        <>
          {Kopfzeilen}
          {Bildwahl}
          {Fliesstext}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Schritte des Verwaltungsjahres</Label>
            {(c.steps || []).map((paar, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className={feldKlasse}
                  value={paar?.[0] ?? ''}
                  placeholder="Beschlüsse"
                  onChange={(e) => {
                    const steps = [...(c.steps || [])];
                    steps[i] = [e.target.value, steps[i]?.[1] ?? ''];
                    setzeConfig({ steps });
                  }}
                />
                <Input
                  className={feldKlasse}
                  value={paar?.[1] ?? ''}
                  placeholder="Umsetzung nachvollziehbar dokumentiert"
                  onChange={(e) => {
                    const steps = [...(c.steps || [])];
                    steps[i] = [steps[i]?.[0] ?? '', e.target.value];
                    setzeConfig({ steps });
                  }}
                />
                <Button
                  type="button" variant="ghost" size="icon"
                  onClick={() => setzeConfig({ steps: (c.steps || []).filter((_, j) => j !== i) })}
                  aria-label="Schritt entfernen"
                >
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setzeConfig({ steps: [...(c.steps || []), ['', '']] })}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Schritt hinzufügen
            </Button>
          </div>
          {ListenFeld('features', 'Funktionen als Schlagworte', 'Erscheinen als kleine orange Pillen.')}
        </>
      )}
    </div>
  );
};

export default DisplaySlideEditor;
