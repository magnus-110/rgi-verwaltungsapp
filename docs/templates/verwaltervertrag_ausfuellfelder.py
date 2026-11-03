"""Verwaltervertrag-Vorlage: Bestellung als Auswahlgruppe (3 Optionen) + unsichtbare Anker-Platzhalter.

Aendert nur word/document.xml der DOCX (alle anderen Teile byte-gleich), ersetzt gezielt die
Runs im Rubrum ("vertreten durch", "Bestellung erfolgte") und die Beschriftungen der
Unterschriftsfelder. Aufruf: python3 vorlage_anpassen.py original.docx neu.docx
"""
import sys, zipfile, re

src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
xml = zin.read("word/document.xml").decode("utf8")

RPR = ('<w:rPr><w:rFonts w:ascii="Calibri" w:cs="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri"/>'
       '<w:b w:val="false"/><w:bCs w:val="false"/><w:i w:val="false"/><w:iCs w:val="false"/>'
       '<w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>')
# Anker: weiss, 1 pt, gestaucht (Laufweite ~0) -> unsichtbar und ohne Einfluss auf das Layout
RPR_ANKER = ('<w:rPr><w:rFonts w:ascii="Calibri" w:cs="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri"/>'
             '<w:b w:val="false"/><w:bCs w:val="false"/><w:i w:val="false"/><w:iCs w:val="false"/>'
             '<w:color w:val="FFFFFF"/><w:w w:val="1"/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>')
PPR = '<w:pPr><w:spacing w:after="20" w:line="240"/><w:jc w:val="left"/></w:pPr>'

def t(s):
    return f'<w:t xml:space="preserve">{s}</w:t>'
def run(*texte, anker=False):
    return f'<w:r>{RPR_ANKER if anker else RPR}{"".join(t(x) for x in texte)}</w:r>'
def para(*runs):
    return f'<w:p>{PPR}{"".join(runs)}</w:p>'

def ersetze_einmal(alt, neu):
    global xml
    n = xml.count(alt)
    if n != 1:
        raise SystemExit(f"Stelle {n}x gefunden statt 1x: {alt[:120]}")
    xml = xml.replace(alt, neu)

# ---- 1) Bestellung erfolgte: drei Optionen + Anker -------------------------------------
alt_te = para(run("☐  durch Teilungserklärung / Gemeinschaftsordnung vom ", "{bestellung.teilungserklaerung_vom}"))
alt_be = para(run("☐  durch Beschluss der Eigentümerversammlung vom ", "{bestellung.beschluss_vom}", " zu TOP ", "{bestellung.beschluss_top}"))
neu = (
    para(run("{bestellung.kreuz_teilungserklaerung}"), run("{anker.bestellung_teilungserklaerung}", anker=True),
         run("  durch Teilungserklärung / Gemeinschaftsordnung vom ", "{bestellung.teilungserklaerung_vom}"),
         run("{anker.bestellung_teilungserklaerung_vom}", anker=True))
    + para(run("{bestellung.kreuz_beschluss}"), run("{anker.bestellung_beschluss}", anker=True),
           run("  durch Beschluss der Eigentümerversammlung vom ", "{bestellung.beschluss_vom}"),
           run("{anker.bestellung_beschluss_vom}", anker=True),
           run(" zu TOP ", "{bestellung.beschluss_top}"),
           run("{anker.bestellung_beschluss_top}", anker=True))
    + para(run("{bestellung.kreuz_umlaufbeschluss}"), run("{anker.bestellung_umlaufbeschluss}", anker=True),
           run("  durch Umlaufbeschluss (§ 23 Abs. 3 WEG) vom ", "{bestellung.umlaufbeschluss_vom}"),
           run("{anker.bestellung_umlaufbeschluss_vom}", anker=True))
)
ersetze_einmal(alt_te + alt_be, neu)

# ---- 2) vertreten durch: Text-Anker, falls leer ----------------------------------------
alt_vd = run("{weg.vertreten_durch}")
ersetze_einmal(alt_vd, run("{weg.vertreten_durch}") + run("{anker.weg_vertreten_durch}", anker=True))

# ---- 3) Unterschriftsfelder: Anker an den Beschriftungen -------------------------------
m = re.search(r'(<w:r><w:rPr>(?:(?!</w:rPr>).)*</w:rPr><w:t xml:space="preserve">Vertreter der GdW</w:t></w:r>)', xml)
if not m or xml.count(m.group(1)) != 1:
    raise SystemExit("Beschriftung 'Vertreter der GdW' nicht eindeutig")
xml = xml.replace(m.group(1), m.group(1) + run("{anker.unterschrift_gdw}", anker=True))
treffer = [x for x in re.finditer(r'(<w:r><w:rPr>(?:(?!</w:rPr>).)*</w:rPr><w:t xml:space="preserve">Hausverwaltung</w:t></w:r>)', xml)]
# 'Hausverwaltung' steht auch im Rubrum (fett) – die Unterschriftsbeschriftung ist die letzte Fundstelle
if len(treffer) < 2:
    raise SystemExit("Beschriftung 'Hausverwaltung' (Unterschrift) nicht gefunden")
letzte = treffer[-1]
xml = xml[:letzte.end()] + run("{anker.unterschrift_rgi}", anker=True) + xml[letzte.end():]

with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = xml.encode("utf8") if item.filename == "word/document.xml" else zin.read(item.filename)
        zout.writestr(item, data)
print("ok")
