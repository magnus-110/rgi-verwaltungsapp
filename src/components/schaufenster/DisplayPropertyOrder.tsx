import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react';

const db = supabase as any;

interface Zeile {
  id: string;
  title: string;
  city: string | null;
  transaction_type: string;
  property_subtype: string | null;
  property_type: string;
  rooms: number | null;
  display_order: number | null;
  display_hidden: boolean;
}

/**
 * Reihenfolge und Sichtbarkeit der Objekte auf dem Bildschirm.
 *
 * Die Website bleibt davon unberührt – ein hier ausgeblendetes
 * Objekt ist weiterhin online zu finden, es läuft nur nicht
 * über den Schaufensterbildschirm.
 */
const DisplayPropertyOrder: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const objekteNeu = () => qc.invalidateQueries({ queryKey: ['broker'] });
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [loading, setLoading] = useState(true);
  const [spaltenFehlen, setSpaltenFehlen] = useState(false);

  const laden = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db
      .from('broker_properties')
      .select('id,title,city,transaction_type:listing_type,property_type,property_subtype,rooms,display_order,display_hidden')
      .eq('show_on_website', true)
      .in('status', ['vermarktung', 'reserviert'])
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204') {
        setSpaltenFehlen(true);
      } else {
        toast({ title: 'Objekte konnten nicht geladen werden', description: error.message, variant: 'destructive' });
      }
      setLoading(false);
      return;
    }
    setSpaltenFehlen(false);
    setZeilen((data || []) as Zeile[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { laden(); }, [laden]);

  const reihenfolgeSchreiben = async (neu: Zeile[]) => {
    const nummeriert = neu.map((z, i) => ({ ...z, display_order: (i + 1) * 10 }));
    setZeilen(nummeriert);
    // Kein upsert: Postgres prüft dabei zuerst die Pflichtfelder der
    // Zeile und bräche ab, weil wir nur die Reihenfolge mitschicken.
    const ergebnisse = await Promise.all(
      nummeriert.map((z) =>
        db.from('broker_properties').update({ display_order: z.display_order }).eq('id', z.id).select('id'),
      ),
    );
    const fehler = ergebnisse.find((r: any) => r.error || !r.data?.length);
    objekteNeu();
    if (fehler) {
      toast({
        title: 'Reihenfolge nicht gespeichert',
        description: fehler.error?.message ?? 'Keine Berechtigung für dieses Objekt.',
        variant: 'destructive',
      });
      laden();
    }
  };

  const verschieben = (index: number, richtung: -1 | 1) => {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= zeilen.length) return;
    const neu = [...zeilen];
    [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
    reihenfolgeSchreiben(neu);
  };

  const sichtbarkeit = async (z: Zeile, sichtbar: boolean) => {
    setZeilen((prev) => prev.map((x) => (x.id === z.id ? { ...x, display_hidden: !sichtbar } : x)));
    const { data: geaendert, error } = await db.from('broker_properties').update({ display_hidden: !sichtbar }).eq('id', z.id).select('id');
    objekteNeu();
    if (error || !geaendert?.length) {
      toast({ title: 'Nicht gespeichert', description: error?.message ?? 'Keine Berechtigung für dieses Objekt.', variant: 'destructive' });
      laden();
    }
  };

  const zuruecksetzen = async () => {
    setZeilen((prev) => prev.map((z) => ({ ...z, display_order: null })));
    const { error } = await db
      .from('broker_properties')
      .update({ display_order: null })
      .in('id', zeilen.map((z) => z.id));
    objekteNeu();
    if (error) {
      toast({ title: 'Nicht gespeichert', description: error.message, variant: 'destructive' });
    }
    laden();
  };

  if (spaltenFehlen) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Die Datenbank ist noch nicht für das Schaufenster umgestellt. Sobald das passiert ist, erscheint hier die Liste.
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Objekte werden geladen …</p>;
  }

  if (!zeilen.length) {
    return <p className="text-sm text-gray-500 py-8 text-center">Zurzeit sind keine Objekte aktiv.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-600 max-w-2xl">
          Die Objekte laufen in dieser Reihenfolge über den Bildschirm. Neue Objekte kommen
          automatisch ans Ende. Ein ausgeblendetes Objekt bleibt auf der Website sichtbar.
        </p>
        <Button variant="outline" size="sm" onClick={zuruecksetzen} className="shrink-0">
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Reihenfolge zurücksetzen
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 bg-white">
        {zeilen.map((z, i) => (
          <div
            key={z.id}
            className={`flex items-center gap-3 px-4 py-3 ${z.display_hidden ? 'opacity-50' : ''}`}
          >
            <span className="w-7 text-sm tabular-nums text-gray-400">{i + 1}</span>

            <div className="flex flex-col gap-0.5">
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => verschieben(i, -1)} disabled={i === 0}
                aria-label="Nach oben"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => verschieben(i, 1)} disabled={i === zeilen.length - 1}
                aria-label="Nach unten"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{z.title}</p>
              <p className="text-xs text-gray-500">
                {z.property_subtype || z.property_type}
                {z.city ? ` · ${z.city}` : ''}
              </p>
            </div>

            <Badge variant="outline" className="shrink-0">
              {z.transaction_type === 'rent' ? 'Vermietung' : 'Verkauf'}
            </Badge>

            <div className="flex items-center gap-2 shrink-0">
              {z.display_hidden
                ? <EyeOff className="w-4 h-4 text-gray-400" />
                : <Eye className="w-4 h-4 text-primary" />}
              <Switch
                checked={!z.display_hidden}
                onCheckedChange={(v) => sichtbarkeit(z, v)}
                aria-label="Auf dem Bildschirm zeigen"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DisplayPropertyOrder;
