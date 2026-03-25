

# Plan: Sidebar-Konten umstrukturieren & Filter entfernen

## Aenderungen

### 1. "Zugeordnet zu"-Filter oben entfernen
- Zeilen 646-663 in `Inbox.tsx` entfernen (der Select fuer `filterAssignedTo`)
- State `filterAssignedTo` und die zugehoerige Query-Logik (Zeilen 212-216) bleiben bestehen, werden aber nicht mehr ueber einen eigenen Filter gesteuert, sondern nur noch ueber die Konten-Sidebar

### 2. Sidebar: Expliziten "Alle"-Button hinzufuegen
- Ueber den Konten-Gruppen einen klickbaren "Alle" Eintrag ergaenzen, der `filterAccountId` auf `"all"` setzt
- Darunter "Meine Konten" (bereits vorhanden)
- Darunter "Weitere Konten" (bereits vorhanden)

### 3. Betroffene Datei
| Datei | Aenderung |
|---|---|
| `src/pages/Inbox.tsx` | "Zugeordnet zu"-Select entfernen, "Alle"-Button in Konten-Sidebar hinzufuegen |

