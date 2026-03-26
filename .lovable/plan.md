

# Plan: Smart-ETV Versammlungsmanagement-Modul

## Einschätzung

Dies ist mit Abstand das komplexeste Modul der App. Es verbindet Echtzeit-Kommunikation (Supabase Realtime), rechtliche Anforderungen (Audit-Log, Vollmachten, Stimmverbote), ein Token-basiertes Gastsystem und ein Multi-Unit-Voting-Interface. Ich empfehle eine **4-Phasen-Umsetzung**, wobei jede Phase eigenständig nutzbar ist.

**Vorhandene Datengrundlage** (die wir nutzen):
- `contact_building_assignments` mit `role_in_building` (eigentuemer, mieter, verwalter, beirat)
- `contact_building_shares` mit `share_type: mea` (MEA-Anteile für gewichtete Abstimmung)
- `buildings` mit `management_mode: weg`
- `profiles` mit Rollen (admin, weg_owner)
- RAG-System (Nova) für Teilungserklärung bereits vorhanden

## Phasenplan

### Phase 1: ETV-Verwaltung + Einladung (Grundgerüst)
- ETV anlegen (Datum, Uhrzeit, Ort, Gebäude)
- TOPs verwalten (Reihenfolge, Beschlusstext, Abstimmungsprinzip)
- TOP-Einreichung durch Eigentümer im Portal
- KI-gestützte Beschlusstext-Formulierung (RAG mit Teilungserklärung)
- Einladungs-PDF generieren
- Navigation: Eigener Menüpunkt "Versammlungen" in der Admin-Sidebar

### Phase 2: Vollmachten & Vorab-Abstimmung
- Digitale Vollmachtserteilung (an Eigentümer, Verwalter, Extern)
- Token-basierter Link für externe Vollmachtempfänger
- Vorab-Weisungen (Ja/Nein/Enthaltung) bei Verwaltervollmacht
- 1h-Sperre vor Versammlungsbeginn
- Stimmverbote pro TOP

### Phase 3: Live-Versammlung & Abstimmung
- Check-in / Anwesenheitsprüfung mit Quorum-Berechnung
- Live-Voting per Supabase Realtime (Auto-Open bei allen Teilnehmern)
- Multi-Unit-Management (mehrere Stimmen pro Person)
- MEA / Kopfprinzip / Doppelt qualifizierte Mehrheit
- Admin-Override für manuelle Stimmabgabe
- Ergebnis-Screen nach Abstimmungsende
- Audit-Log (User, Unit, Timestamp)

### Phase 4: Protokoll & Archiv
- Live-Notizen pro TOP
- KI-Protokoll-Erstellung (Lovable AI)
- Beschlusssammlung (durchsuchbar)
- Portal-Sync nach Admin-Freigabe

## Technische Umsetzung (Phase 1 — Startumfang)

### Datenbank-Tabellen (Migration)

```sql
-- Haupt-Tabelle: Eigentümerversammlungen
CREATE TABLE etv_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, invited, in_progress, completed, cancelled
  quorum_reached BOOLEAN DEFAULT false,
  lock_time TIMESTAMPTZ,  -- 1h vor meeting_date, automatisch berechnet
  created_by UUID REFERENCES profiles(user_id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tagesordnungspunkte
CREATE TABLE etv_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES etv_meetings(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  resolution_text TEXT,        -- Beschlusstext
  voting_principle TEXT NOT NULL DEFAULT 'mea',  -- mea, headcount, double_qualified
  category TEXT,               -- baulich, finanziell, verwaltung, sonstiges
  submitted_by_contact_id UUID REFERENCES contacts(id),
  status TEXT DEFAULT 'pending',  -- pending, voting, voted, skipped
  result TEXT,                 -- passed, failed, tabled
  yes_count NUMERIC DEFAULT 0,
  no_count NUMERIC DEFAULT 0,
  abstain_count NUMERIC DEFAULT 0,
  total_mea_voted NUMERIC DEFAULT 0,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anwesenheit
CREATE TABLE etv_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES etv_meetings(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES contact_building_assignments(id),
  attendance_type TEXT NOT NULL DEFAULT 'absent',  -- present, proxy, absent
  proxy_type TEXT,             -- owner, manager, external
  proxy_contact_id UUID REFERENCES contacts(id),
  proxy_token TEXT UNIQUE,     -- für externe Vollmacht
  proxy_token_used BOOLEAN DEFAULT false,
  pre_vote_instructions JSONB, -- {"agenda_item_id": "yes/no/abstain"}
  checked_in_at TIMESTAMPTZ,
  voting_banned_items UUID[],  -- Stimmverbote für bestimmte TOPs
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Einzelstimmen (Audit-Log)
CREATE TABLE etv_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id UUID NOT NULL REFERENCES etv_agenda_items(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES contact_building_assignments(id),
  vote TEXT NOT NULL,          -- yes, no, abstain
  mea_weight NUMERIC,         -- MEA-Anteil bei der Abstimmung
  voted_by_user_id UUID,      -- wer die Stimme abgegeben hat (Eigentümer, Vertreter oder Admin)
  is_proxy_vote BOOLEAN DEFAULT false,
  is_manual_override BOOLEAN DEFAULT false,
  ip_address TEXT,
  voted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agenda_item_id, assignment_id)
);
```

### Neue Dateien

| Datei | Beschreibung |
|---|---|
| `src/pages/Meetings.tsx` | Hauptseite: ETV-Liste + Detail-Ansicht |
| `src/components/meetings/MeetingList.tsx` | Liste aller ETVs mit Status-Badges |
| `src/components/meetings/MeetingEditor.tsx` | Guided Workflow zum Erstellen/Bearbeiten |
| `src/components/meetings/AgendaItemEditor.tsx` | TOP-Verwaltung mit Drag & Drop |
| `src/components/meetings/AgendaAiAssistant.tsx` | KI-Beschlusstext via RAG |
| `src/components/meetings/MeetingInvitationPdf.tsx` | PDF-Einladung generieren (Edge Function) |

### Sidebar-Eintrag
- Neuer Menüpunkt "Versammlungen" mit `Users`-Icon zwischen "Adressen" und "Finanzen"
- Route: `/versammlungen`

### WEG-Owner Portal (Phase 1)
- Neuer Menüpunkt "Versammlungen" im WegOwnerLayout
- Route: `/weg-owner/meetings`
- Ansicht: anstehende ETVs, eigene TOPs einreichen, Einladungen einsehen

### Workflow (Guided Steps wie BillingTab)
1. **Grunddaten** — Datum, Uhrzeit, Ort, Titel
2. **Tagesordnung** — TOPs anlegen, sortieren, Beschlusstexte formulieren (mit KI)
3. **Einladung** — Vorschau + PDF generieren + verschicken

Phasen 2-4 werden als weitere Schritte und Features zum selben Modul hinzugefügt.

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `supabase/migrations/` | 4 neue Tabellen + RLS-Policies |
| `src/pages/Meetings.tsx` | **Neu**: Hauptseite |
| `src/components/meetings/*.tsx` | **Neu**: 6 Komponenten |
| `src/components/AdminSidebar.tsx` | Neuer Menüpunkt |
| `src/components/WegOwnerLayout.tsx` | Neuer Menüpunkt |
| `src/pages/weg-owner/Meetings.tsx` | **Neu**: Eigentümer-Portal |
| `src/App.tsx` | Neue Routen |
| `supabase/functions/generate-meeting-invitation/index.ts` | **Neu**: PDF-Einladung |

