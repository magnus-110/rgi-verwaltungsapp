

## Performance & Skalierungs-Audit — Phasenplan

Bei 200 Gebäuden, tausenden Dokumenten und tausenden Eigentümern sind die kritischen Engpässe: ungefilterte Queries (1000-Zeilen-Limit), fehlende Pagination, fehlende DB-Indizes, große React-Listen ohne Virtualisierung, fehlende Memoization und N+1 Query-Patterns.

### Vorgehen
Wie bei Mobile: **5 Phasen**, jede testbar. Nach jeder Phase Freigabe.

---

### Phase 1 — Datenbank-Foundation (Indizes & RPCs)
**Ziel**: SQL-Layer für Skalierung vorbereiten.
- Audit aller Tabellen mit >1.000 erwarteten Zeilen: `bookings`, `invoices`, `bank_transactions`, `document_chunks`, `building_files`, `email_messages`, `todos`, `contacts`, `contact_building_assignments`, `etv_votes`
- Indizes auf häufige Filter: `building_id`, `fiscal_year`, `created_at DESC`, `status`, `(building_id, booking_date)`, `(user_id, building_id)`
- Composite-Indizes für Sortierung+Filter
- Aggregations-RPCs statt Client-Aggregationen (z.B. `get_building_dashboard_stats(building_id)`)
- Prüfung der RLS-Policies auf Performance (vermeide Subqueries in `USING`)

### Phase 2 — Listen & Pagination (Frontend Daten-Hydration)
**Ziel**: Niemals mehr als 50–100 Zeilen pro Request laden.
- Alle `select('*')` auditieren → nur benötigte Spalten
- Server-Side Pagination via `.range(from, to)` für: `Inbox`, `Contacts`, `Todos`, `Buildings`, `Bookings`, `BankStatements`, `Invoices`, `Reports`
- Infinite Scroll oder klassische Pagination (Cursor-basiert wo sinnvoll)
- Server-Side Suche/Filter (statt Client-Filter über alle Daten)
- React Query `staleTime` & `gcTime` korrekt setzen, `keepPreviousData` für sanfte UX

### Phase 3 — Virtualisierung großer Listen
**Ziel**: DOM bleibt klein, auch bei 1000+ Einträgen im Viewport.
- `@tanstack/react-virtual` einführen für: `BuildingList`, `ContactList`, `BookingsTab`, `BankStatementsTab`, `EmailList`, `BuildingFilesTab`, `DocumentList`
- Sticky Header bleibt, nur Body virtualisiert
- Memoization von Row-Komponenten via `React.memo` + stabile Keys

### Phase 4 — Heavy Pages (Finance, ETV, Documents)
**Ziel**: Spezifische Hot-Paths optimieren.
- **Finance/Settlement**: Batch-Berechnungen serverseitig (Edge Function), Caching, Web Worker für Client-Berechnungen bei großen Properties
- **ETV Live-Voting**: Realtime-Channels nur pro aktiver Meeting subscriben, debounced Updates
- **Documents/Nova**: RAG-Suche bereits gut indexiert, aber `document_chunks` Index auf `(building_id, category)` prüfen
- **Email Sync**: Pagination der `email_messages` (aktuell evtl. alle laden), Lazy-Load von Attachments
- **Building Dashboard**: Stats via einer einzigen RPC statt 8 separaten Queries

### Phase 5 — Bundle, Assets & Auth
**Ziel**: Initial Load & Wahrnehmung.
- Code-Splitting via `React.lazy()` für Heavy-Routen (Finance, Meetings, Documents)
- Bundle-Analyse (`vite-plugin-visualizer`) → unbenutzte Dependencies entfernen
- Bilder/Logos: WebP, Lazy Loading
- React Query Devtools nur in Dev
- Auth: Session-Caching, vermeide doppelte `useAuth`-Subscriptions
- Service Worker für Offline-First bei statischen Assets

---

### Empfehlung
**Mit Phase 1 starten** — DB-Indizes sind die Foundation und liefern sofort messbare Verbesserungen ohne UI-Risiko. Dann Phase 2 (Pagination), die den größten Effekt auf User-Wahrnehmung hat. Phase 3-5 darauf aufbauend.

### Geänderte Bereiche pro Phase
| Phase | Typ | Risiko |
|---|---|---|
| 1 — DB Indizes | Migrations + RPCs | Niedrig (read-only Optimierung) |
| 2 — Pagination | Hooks + Komponenten | Mittel (Datenfluss ändert sich) |
| 3 — Virtualisierung | Listenkomponenten | Niedrig (visuell identisch) |
| 4 — Heavy Pages | Edge Functions + Komponenten | Mittel |
| 5 — Bundle | Vite Config + lazy imports | Niedrig |

Soll ich mit **Phase 1 (Datenbank-Indizes & Aggregations-RPCs)** beginnen?

