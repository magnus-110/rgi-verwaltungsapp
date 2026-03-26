

# Plan: Einstellungsseite neu strukturieren & Chatbot integrieren

## Aktuelle Probleme
- Settings-Seite ist eine lange Card-Liste ohne Struktur (877 Zeilen)
- Chatbot-Einstellungen sind eine separate Seite (`/chatbot`) mit eigenem Sidebar-Eintrag
- Kontenrahmen und PDF-Vorlagen sollen ebenfalls in die Einstellungen (aus dem vorherigen Plan)

## Neue Struktur: Tab-basierte Einstellungsseite

Die Einstellungsseite wird in **5 Tabs** aufgeteilt, die über eine horizontale Tab-Navigation erreichbar sind:

```text
Einstellungen
├── Profil & Sicherheit     → Persönliche Daten, Passwort ändern
├── Benutzerverwaltung       → Admins erstellen/verwalten, Mitarbeiter erstellen/verwalten
├── Chatbot (NOVA)           → System Prompt, Wissensdokumente, Gesprächsverlauf
├── E-Mail                   → E-Mail-Einstellungen (EmailSettingsSection)
└── Dokumente & Vorlagen     → Kontenrahmen, PDF-Vorlagen (ReportTemplateSettings)
```

## Umsetzung

### 1. Settings.tsx umbauen
- Tabs-Komponente (shadcn `Tabs`) als Hauptnavigation
- Jeder Tab rendert die entsprechenden Cards
- **Tab "Chatbot"**: Gesamten Inhalt aus `ChatbotSettings.tsx` hierher verschieben (System Prompt, KnowledgeDocumentsManager, Gesprächsverlauf)
- **Tab "Dokumente & Vorlagen"**: `ChartOfAccountsTab` (globaler Kontenrahmen) und `ReportTemplateSettings` einbetten

### 2. Sidebar bereinigen
**`AdminSidebar.tsx`**: "Chatbot"-Eintrag (`/chatbot`) aus `menuItems` entfernen. Die Chatbot-Verwaltung ist nun unter Einstellungen erreichbar.

### 3. Route entfernen
**`App.tsx`**: Route `/chatbot` entfernt oder als Redirect zu `/settings?tab=chatbot` umgeleitet.

### 4. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/pages/Settings.tsx` | Komplett umgebaut: 5 Tabs, Chatbot-Logik integriert |
| `src/components/AdminSidebar.tsx` | "Chatbot" aus menuItems entfernen |
| `src/App.tsx` | `/chatbot` Route → Redirect zu `/settings` |
| `src/pages/ChatbotSettings.tsx` | Bleibt als Datei bestehen (Import in Settings), oder Inhalt wird direkt migriert |

