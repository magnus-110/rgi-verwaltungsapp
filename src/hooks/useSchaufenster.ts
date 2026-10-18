import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_SETTINGS,
  DisplaySettings,
  DisplaySlide,
  SlideKind,
  SLIDE_TEMPLATES,
} from '@/lib/schaufenster';

/**
 * Lädt und speichert den Ablauf der Schaufensteranzeige.
 *
 * Fehlen die Tabellen display_slides / display_settings noch,
 * meldet der Hook das über `tabellenFehlen`, statt einen Fehler
 * zu werfen. Die Anzeige selbst läuft in dem Fall mit ihrem
 * eingebauten Standardablauf weiter.
 */

// Bis Lovable die Typen neu erzeugt hat, sprechen wir die neuen
// Tabellen ohne Typprüfung an.
const db = supabase as any;

const POSTGREST_TABELLE_FEHLT = ['42P01', 'PGRST205', 'PGRST204'];

export const useDisplayConfig = () => {
  const { toast } = useToast();
  const [slides, setSlides] = useState<DisplaySlide[]>([]);
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tabellenFehlen, setTabellenFehlen] = useState(false);

  const laden = useCallback(async () => {
    setLoading(true);
    try {
      const [slideRes, settingRes] = await Promise.all([
        db.from('display_slides').select('*').order('sort_order', { ascending: true }),
        db.from('display_settings').select('*').eq('id', 1).maybeSingle(),
      ]);

      if (slideRes.error) {
        if (POSTGREST_TABELLE_FEHLT.includes(slideRes.error.code)) {
          setTabellenFehlen(true);
          setSlides([]);
          setLoading(false);
          return;
        }
        throw slideRes.error;
      }

      setTabellenFehlen(false);
      setSlides(
        (slideRes.data || []).map((row: any) => ({
          ...row,
          config: row.config || {},
        })) as DisplaySlide[],
      );

      if (settingRes.data) {
        setSettings({ ...DEFAULT_SETTINGS, ...settingRes.data });
      }
    } catch (error) {
      toast({
        title: 'Konfiguration konnte nicht geladen werden',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    laden();
  }, [laden]);

  /** Eine Folie speichern. */
  const folieSpeichern = useCallback(
    async (slide: DisplaySlide) => {
      setSaving(true);
      try {
        const { error } = await db
          .from('display_slides')
          .update({
            kind: slide.kind,
            sort_order: slide.sort_order,
            is_active: slide.is_active,
            duration_seconds: slide.duration_seconds,
            config: slide.config,
          })
          .eq('id', slide.id);
        if (error) throw error;

        setSlides((prev) => prev.map((s) => (s.id === slide.id ? slide : s)));
        return true;
      } catch (error) {
        toast({
          title: 'Speichern fehlgeschlagen',
          description: error instanceof Error ? error.message : 'Unbekannter Fehler',
          variant: 'destructive',
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  /** Neue Folie am Ende anfügen. */
  const folieAnlegen = useCallback(
    async (kind: SlideKind) => {
      setSaving(true);
      try {
        const maxOrder = slides.reduce((m, s) => Math.max(m, s.sort_order), 0);
        const { data, error } = await db
          .from('display_slides')
          .insert([
            {
              kind,
              sort_order: maxOrder + 10,
              is_active: true,
              duration_seconds: null,
              config: SLIDE_TEMPLATES[kind],
            },
          ])
          .select('*')
          .single();
        if (error) throw error;

        const neu = { ...data, config: data.config || {} } as DisplaySlide;
        setSlides((prev) => [...prev, neu]);
        return neu;
      } catch (error) {
        toast({
          title: 'Folie konnte nicht angelegt werden',
          description: error instanceof Error ? error.message : 'Unbekannter Fehler',
          variant: 'destructive',
        });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [slides, toast],
  );

  const folieLoeschen = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        const { error } = await db.from('display_slides').delete().eq('id', id);
        if (error) throw error;
        setSlides((prev) => prev.filter((s) => s.id !== id));
        return true;
      } catch (error) {
        toast({
          title: 'Löschen fehlgeschlagen',
          description: error instanceof Error ? error.message : 'Unbekannter Fehler',
          variant: 'destructive',
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  /**
   * Reihenfolge neu vergeben. Die Positionen werden in Zehnerschritten
   * geschrieben, damit später problemlos etwas dazwischen passt.
   */
  const reihenfolgeSpeichern = useCallback(
    async (neueReihenfolge: DisplaySlide[]) => {
      const nummeriert = neueReihenfolge.map((s, i) => ({ ...s, sort_order: (i + 1) * 10 }));
      setSlides(nummeriert);
      setSaving(true);
      try {
        const ergebnisse = await Promise.all(
          nummeriert.map((s) =>
            db.from('display_slides').update({ sort_order: s.sort_order }).eq('id', s.id),
          ),
        );
        const fehler = ergebnisse.find((r: any) => r.error);
        if (fehler) throw fehler.error;
        return true;
      } catch (error) {
        toast({
          title: 'Reihenfolge konnte nicht gespeichert werden',
          description: error instanceof Error ? error.message : 'Unbekannter Fehler',
          variant: 'destructive',
        });
        laden();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [toast, laden],
  );

  const einstellungenSpeichern = useCallback(
    async (neu: DisplaySettings) => {
      setSettings(neu);
      setSaving(true);
      try {
        const { error } = await db
          .from('display_settings')
          .update({
            object_duration_seconds: neu.object_duration_seconds,
            content_duration_seconds: neu.content_duration_seconds,
            city_filter: neu.city_filter || null,
          })
          .eq('id', 1);
        if (error) throw error;
        return true;
      } catch (error) {
        toast({
          title: 'Einstellungen konnten nicht gespeichert werden',
          description: error instanceof Error ? error.message : 'Unbekannter Fehler',
          variant: 'destructive',
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  return {
    slides,
    settings,
    loading,
    saving,
    tabellenFehlen,
    laden,
    folieSpeichern,
    folieAnlegen,
    folieLoeschen,
    reihenfolgeSpeichern,
    einstellungenSpeichern,
  };
};
