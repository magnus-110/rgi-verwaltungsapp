

## Fix: Telefon & E-Mail werden nicht aus CSV extrahiert

### Ursache
Die CSV-Header lauten z.B.:
- `Telefon geschäftlich`, `Telefon geschäftlich 2`, ... `Telefon geschäftlich 10`
- `E-Mail-Adresse`, `E-Mail 2: Adresse`, `E-Mail 3: Adresse`, ...
- `Fax geschäftlich`
- `Postleitzahl geschäftlich`

Die aktuellen Regex-Muster in `mapHeaders()` matchen nur `Telefon 1`, `Tel 2`, `E-Mail 1` etc. — nicht die tatsächlichen HV-Office-Headerformate mit "geschäftlich" oder "Adresse".

### Fix in `ImportContactsCsvDialog.tsx`

**1. HEADER_MAP erweitern** um explizite Einträge für die gängigsten HV-Office-Header:
```
"postleitzahl geschäftlich" → "plz"
"e-mail-adresse" → email
"fax geschäftlich" → fax  (bereits vorhanden)
```

**2. Regex-Muster in `mapHeaders()` anpassen:**

Telefon-Regex ändern von:
```regex
/^(telefon|tel)\s*\d*$/i
```
zu:
```regex
/^(telefon|tel)[\s.\-]*(geschäftlich\s*)?(\d*)$/i
```

E-Mail-Regex ändern von:
```regex
/^e-?mail\s*\d*$/i
```
zu:
```regex
/^e-?mail[-\s]*(\d*)[:\s]*(adresse)?$/i
```

Dies matcht alle Varianten:
- `Telefon geschäftlich` ✓
- `Telefon geschäftlich 2` ✓
- `E-Mail-Adresse` ✓
- `E-Mail 2: Adresse` ✓

**3. PLZ-Header hinzufügen** (fehlt auch):
`"postleitzahl geschäftlich"` → `"plz"` im HEADER_MAP

### Betroffene Datei
- `src/components/contacts/ImportContactsCsvDialog.tsx` — nur `HEADER_MAP` + `mapHeaders()`

