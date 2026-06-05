## Ziel
Admin-„NOVA" (interner Dokumenten-Chat für Admins/Mitarbeiter) komplett aus der App und dem Code entfernen. Das tenant/WEG-Owner-Chatbot-System sowie die RAG-Verarbeitung beim DMS-Upload bleiben unverändert.

## Was bleibt erhalten (RAG für DMS)
- `supabase/functions/process-building-file` (DMS-Upload → Chunks/Embeddings)
- `supabase/functions/process-document`, `process-bulk-upload`, `process-knowledge-document`
- `supabase/functions/chat-with-ai` (tenant/weg-owner Chatbot)
- `KnowledgeDocumentsManager` und Settings-Tab „Chatbot" (für Mieter/WEG-Owner-Chat)
- `src/pages/tenant/Chatbot.tsx`, `src/pages/weg-owner/Chatbot.tsx`
- DMS unter `src/components/buildings/documents/*` und `src/components/files/*`

## Was entfernt wird

### Navigation
- `src/components/AdminSidebar.tsx`: Eintrag `{ title: "NOVA", url: "/documents", icon: Sparkles }` entfernen (Z. 42).
- `src/components/MobileHeader.tsx`: NOVA-Eintrag in `getNavigationItems()` für admin/employee entfernen (Z. 97). Die `Sparkles`-Verwendungen für tenant/weg-owner Chat bleiben.

### Routen
- `src/App.tsx`: 
  - Lazy-Imports `Documents` und `DocumentSettings` (Z. 29–30) entfernen.
  - Routen `/documents` und `/documents/settings` (Z. 112–113) entfernen.

### Seiten/Komponenten löschen
- `src/pages/Documents.tsx`
- `src/pages/DocumentSettings.tsx`
- Ordner `src/components/documents/` (NOVA-UI: AddPromptDialog, ChatHistorySidebar, ChatInputField, ChatMessages, ChatWelcome, DocumentChat, DocumentSourcesList, DocumentUpload, EditPromptDialog, KnowledgeScopeSelector, NewCategoryDialog, PdfViewerModal, PromptEnhancerSuggestion, PromptGuideSheet, PromptTemplateMenu, UploadDialog, UploadProgressWidget, CategorySelector, BuildingDocumentList)

### Edge Functions löschen
- `supabase/functions/query-documents` (nur von Documents.tsx + CaseAskAi genutzt)
- `supabase/functions/enhance-prompt` (Prompt-Optimierung im NOVA-Chat)

### Case-Feature: NOVA-Abhängigkeit entkoppeln
- `src/components/cases/CaseAskAi.tsx` nutzt `query-documents`. Wird mit entfernt.
- `src/components/cases/CaseDetailView.tsx`: Import + Rendering von `<CaseAskAi … />` (Z. 14, 217) entfernen.

### Settings-Aufräumung (optional, nur NOVA-spezifisches)
- `src/pages/Settings.tsx` Kommentar „Chatbot (NOVA)" → in „Chatbot" umbenennen, KEINE Inhalte entfernen (dieser Tab ist für tenant/WEG-Chatbot, nicht NOVA).

### LocalStorage
- `nova_*`-Keys werden mit Documents.tsx zusammen gelöscht; keine Migration nötig (browser-local).

## Datenbank
Keine Migration. Tabellen wie `knowledge_documents`, `document_chunks`, `building_files` etc. bleiben — sie werden weiter von DMS/Chatbot genutzt.

## Akzeptanzkriterien
- [ ] „NOVA" erscheint nirgendwo mehr in Sidebar/MobileHeader.
- [ ] `/documents` und `/documents/settings` sind nicht mehr erreichbar.
- [ ] Build läuft fehlerfrei (keine toten Imports).
- [ ] DMS-Upload eines neuen Dokuments triggert weiterhin `process-building-file` → Embeddings.
- [ ] Tenant- und WEG-Owner-Chat funktionieren weiter.
- [ ] CaseDetailView öffnet ohne Fehler (ohne AskAi-Block).