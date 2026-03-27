

# Plan: Einladung überarbeiten — Briefpapier-Design & ohne Beschlusstext

## Änderungen

### 1. Beschlusstext entfernen
Aus der `generateHtml()`-Funktion die Zeile mit `resolution_text` und den `voting-badge` komplett entfernen. Die Einladung zeigt pro TOP nur noch Nummer, Titel und Beschreibung.

### 2. Briefpapier-Design mit Logo oben rechts
Das HTML-Template komplett überarbeiten, damit es dem App-Design entspricht:

- **Logo**: RGI-Logo (`/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png`) oben rechts als absolute positioniertes Element im Header, wie auf einem Briefkopf. Da es ein iframe mit `srcDoc` ist, wird das Logo als Base64-DataURL eingebettet oder als absolute URL zum Preview-Host referenziert.
- **Farbschema**: RGI Orange (`#ee7202`) als Akzentfarbe statt dem bisherigen Blau (`#2563eb`). Anthrazit (`#4a4849`) für Text. Cremeweiß (`#faf8f5`) als Hintergrund-Akzent.
- **Header**: Logo rechts, Titel "Einladung zur Eigentümerversammlung" links — klassisches Briefpapier-Layout.
- **TOPs**: Border-left in Orange statt Blau, saubere Darstellung mit nur TOP-Nummer, Titel und optionaler Beschreibung.
- **Footer**: Dezente Linie in Orange.

### Technische Details

| Datei | Änderung |
|---|---|
| `src/components/meetings/MeetingInvitationPdf.tsx` | `generateHtml()` — Template-Redesign: Blau→Orange, Logo oben rechts, Beschlusstext+Voting-Badge entfernen. Logo-URL als absolute URL (`window.location.origin + '/lovable-uploads/...'`) für iframe-Kompatibilität. |

