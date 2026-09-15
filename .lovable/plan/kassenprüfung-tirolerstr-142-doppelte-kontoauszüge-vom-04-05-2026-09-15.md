# Kassenprüfung Tirolerstr. 142: doppelte Kontoauszüge vom 04.05.2026 ausblenden

## Was ich gefunden habe

Die beiden Dateien vom 04.05.2026 sind keine Dokumente der Kassenprüfung. Es sind zwei Kontoauszüge (Februar 2025 und März 2025), die im Mai 2026 in der Buchhaltung hochgeladen wurden. Die Kassenprüfung zeigt automatisch **alle** PDF-Kontoauszüge des Wirtschaftsjahres 2025 dieser Liegenschaft an — deshalb tauchen sie dort auf, obwohl der Prüfer inzwischen zwei vollständige Auszüge (15.09.2026) manuell hinterlegt hat.

Wichtig: An diesen beiden Auszügen hängen 31 gebuchte Bankumsätze. Ein Löschen würde die Buchhaltung beschädigen. Sie dürfen nur aus der Prüfungsansicht verschwinden.

## Lösung

1. Kontoauszüge bekommen eine Kennzeichnung "nicht in der Kassenprüfung anzeigen".
2. Die Kassenprüfung blendet so gekennzeichnete Auszüge aus — in der internen Ansicht und im Prüfer-Link.
3. In der Dokumenten-Liste der Kassenprüfung gibt es für die Verwaltung pro automatisch übernommenem Auszug eine Möglichkeit, ihn auszublenden (und wieder einzublenden). Der Prüfer selbst sieht diese Möglichkeit nicht.
4. Die beiden konkreten Auszüge vom 04.05.2026 werden direkt als ausgeblendet markiert, damit die Prüfung Tirolerstr. 142 sofort sauber ist.

## Technische Details

- Migration: `bank_statements.exclude_from_audit boolean not null default false`.
- `src/components/finance/CashAuditDocuments.tsx`: Query `audit-bank-pdfs` filtert `.eq("exclude_from_audit", false)`; neuer Ausblenden-Button (nur wenn `!tokenMode`) mit Update + Query-Invalidierung; optionaler Umschalter "Ausgeblendete anzeigen".
- RPC `get_audit_bank_statement_pdfs_by_token` (security definer) um denselben Filter ergänzen, damit der Token-Zugang identisch ist.
- Datenkorrektur: `exclude_from_audit = true` für die Statements `40b17193-…` und `912db5b8-…` (Tirolerstr. 142). Keine Zeile wird gelöscht, alle Buchungen bleiben erhalten.
