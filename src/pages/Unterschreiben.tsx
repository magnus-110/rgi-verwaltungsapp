import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Rahmen } from "@/components/signatur/public/ui";
import { holeDownload, holeInfo, NetzFehler, oeffnePdf, unterschreiben, type SignErgaenzung, type SignErgebnis, type SignFeld, type SignInfo } from "@/components/signatur/public/api";
import { istAktiv, type Werte } from "@/components/signatur/public/Felder";
import { startWerte } from "@/components/signatur/public/Formular";
import SchrittLesen from "@/components/signatur/public/SchrittLesen";
import SchrittUnterschreiben from "@/components/signatur/public/SchrittUnterschreiben";
import SchrittFertig from "@/components/signatur/public/SchrittFertig";
import PapierSeite, { PapierDanke } from "@/components/signatur/public/PapierSeite";
import { Laden, LinkUngueltig, Stoerung, type UngueltigGrund } from "@/components/signatur/public/Hinweisseiten";

type Schritt = "lesen" | "unterschreiben" | "fertig" | "papier" | "papier_danke";

/**
 * Öffentliche Unterzeichner-Seite /unterschreiben/:token (ohne Login, Handy zuerst).
 * Daten ausschließlich über die Edge-Funktion „sign-public“.
 */
export default function Unterschreiben() {
  const { token = "" } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const papierDirekt = params.get("papier") === "1";

  const [info, setInfo] = useState<SignInfo | null>(null);
  const [ladeFehler, setLadeFehler] = useState<{ text: string; netz: boolean } | null>(null);
  const [versuch, setVersuch] = useState(0);
  const [schritt, setSchritt] = useState<Schritt>(papierDirekt ? "papier" : "lesen");

  const [gelesen, setGelesen] = useState(false);
  const [name, setName] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [zustimmung, setZustimmung] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<SignErgebnis | null>(null);
  const [papierSeiten, setPapierSeiten] = useState(0);
  /** Eingaben in Ausfüllfelder (Feld-ID → Wert); gehen mit der Unterschrift an sign-public */
  const [werte, setWerte] = useState<Werte>({});
  const setWert = useCallback((f: SignFeld, wert: string | null) => {
    setWerte((alt) => {
      const neu: Werte = { ...alt, [f.id]: wert };
      // Auswahl „genau eins“: andere Möglichkeiten derselben Gruppe abwählen
      if (f.typ === "auswahl" && wert === "ja") {
        for (const x of info?.felder ?? []) {
          if (x.eigen && x.id !== f.id && x.typ === "auswahl" && x.gruppe === f.gruppe) neu[x.id] = null;
        }
      }
      return neu;
    });
  }, [info]);

  /** Eigene Ergänzungen/Korrekturen (nur mit Freigabe); gehen mit der Unterschrift an sign-public */
  const [ergaenzungen, setErgaenzungen] = useState<SignErgaenzung[]>([]);

  const [dlBusy, setDlBusy] = useState(false);
  const [dlFehler, setDlFehler] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Elektronische Unterschrift · RGI Immobilien";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  // Kein versehentliches Neuladen durch Herunterziehen (nur auf dieser Seite)
  useEffect(() => {
    const html = document.documentElement;
    const alt = { html: html.style.overscrollBehaviorY, body: document.body.style.overscrollBehaviorY };
    html.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";
    return () => {
      html.style.overscrollBehaviorY = alt.html;
      document.body.style.overscrollBehaviorY = alt.body;
    };
  }, []);

  // Warnung beim Verlassen, solange gezeichnet, aber noch nicht abgeschickt
  const ungesendet = (!!png || ergaenzungen.length > 0) && ["lesen", "unterschreiben"].includes(schritt) && !ergebnis;
  useEffect(() => {
    if (!ungesendet) return;
    const warnen = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [ungesendet]);

  useEffect(() => {
    let aktiv = true;
    setLadeFehler(null);
    setInfo(null);
    if (!token.trim()) {
      setInfo({ zustand: "unbekannt" } as SignInfo);
      return;
    }
    holeInfo(token)
      .then((d) => {
        if (!aktiv) return;
        setInfo(d);
        setName((n) => n || d.name || "");
        // Datum „heute“ und vorbelegte Angaben (Text aus dem Dokument) als Startwerte
        setWerte((alt) => ({ ...startWerte(d.felder ?? []), ...alt }));
      })
      .catch((e) => {
        if (!aktiv) return;
        setLadeFehler({ text: e?.message || "Unbekannter Fehler.", netz: e instanceof NetzFehler });
      });
    return () => { aktiv = false; };
  }, [token, versuch]);

  const geheZu = (s: Schritt) => {
    setSchritt(s);
    setDlFehler(null);
    window.scrollTo({ top: 0 });
  };

  const download = useCallback(async () => {
    setDlFehler(null);
    setDlBusy(true);
    try {
      await oeffnePdf(async () => {
        if (ergebnis?.download_url) return ergebnis.download_url;
        try {
          return (await holeDownload(token)).url;
        } catch (e) {
          if (info?.pdf_url && !ergebnis && info.zustand === "ok") return info.pdf_url;
          throw e;
        }
      });
    } catch (e: any) {
      setDlFehler(e?.message || "Das PDF konnte gerade nicht geladen werden. Bitte versuchen Sie es erneut.");
    } finally {
      setDlBusy(false);
    }
  }, [token, info, ergebnis]);

  const senden = async () => {
    setBusy(true);
    setFehler(null);
    try {
      // Nur eigene, aktive Felder senden (inaktive werden serverseitig ohnehin geleert)
      const felder = info?.felder ?? [];
      const eingaben: Record<string, string | null> = {};
      for (const f of felder.filter((x) => x.eigen)) eingaben[f.id] = istAktiv(f, felder, werte) ? werte[f.id] ?? null : null;
      const r = await unterschreiben(token, name.trim(), png, eingaben, info?.darf_ergaenzen ? ergaenzungen : undefined);
      setErgebnis(r);
      geheZu("fertig");
    } catch (e: any) {
      setFehler(e?.message || "Die Unterschrift konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    } finally {
      setBusy(false);
    }
  };

  let inhalt: JSX.Element;
  if (ladeFehler) {
    inhalt = <Stoerung text={ladeFehler.text} netz={ladeFehler.netz} onNochmal={() => setVersuch((v) => v + 1)} />;
  } else if (!info) {
    inhalt = <Laden />;
  } else if (schritt === "fertig" && ergebnis) {
    inhalt = <SchrittFertig info={info} ergebnis={ergebnis} name={name} onDownload={download} busy={dlBusy} downloadFehler={dlFehler} />;
  } else if (schritt === "papier_danke") {
    inhalt = <PapierDanke seiten={papierSeiten} />;
  } else if (info.zustand !== "ok" || info.papier_eingegangen) {
    const grund: UngueltigGrund =
      info.zustand === "ok" ? "papier_eingegangen" : (["abgelaufen", "zurueckgezogen", "unterschrieben", "papier_eingegangen"].includes(info.zustand) ? info.zustand : "unbekannt") as UngueltigGrund;
    inhalt = <LinkUngueltig grund={grund} info={info} onDownload={download} downloadBusy={dlBusy} downloadFehler={dlFehler} />;
  } else if (schritt === "papier") {
    inhalt = (
      <PapierSeite
        token={token}
        info={info}
        onZurueck={() => geheZu("lesen")}
        onDownload={download}
        downloadBusy={dlBusy}
        downloadFehler={dlFehler}
        onFertig={(n) => { setPapierSeiten(n); geheZu("papier_danke"); }}
      />
    );
  } else if (schritt === "unterschreiben") {
    inhalt = (
      <SchrittUnterschreiben
        info={info}
        name={name}
        setName={setName}
        png={png}
        setPng={setPng}
        zustimmung={zustimmung}
        setZustimmung={setZustimmung}
        busy={busy}
        fehler={fehler}
        onZurueck={() => geheZu("lesen")}
        onSenden={senden}
        werte={werte}
        ergaenzungen={info.darf_ergaenzen ? ergaenzungen : []}
      />
    );
  } else {
    inhalt = (
      <SchrittLesen
        info={info}
        gelesen={gelesen}
        setGelesen={setGelesen}
        onWeiter={() => geheZu("unterschreiben")}
        onPapier={() => geheZu("papier")}
        onDownload={download}
        downloadFehler={dlFehler}
        werte={werte}
        setWert={setWert}
        ergaenzungen={ergaenzungen}
        setErgaenzungen={setErgaenzungen}
      />
    );
  }

  const formular = !!info && info.zustand === "ok" && schritt === "lesen" && ((info.felder ?? []).some((f) => f.eigen) || !!info.darf_ergaenzen);
  return <Rahmen breit={formular}>{inhalt}</Rahmen>;
}
