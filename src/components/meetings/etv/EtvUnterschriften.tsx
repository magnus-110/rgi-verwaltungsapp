/**
 * Unterschriften unter dem ETV-Protokoll (§ 24 Abs. 6 WEG) – Mockup v11.
 *
 * Läuft über die allgemeine elektronische Unterschrift (sign_requests, typ
 * „etv_protokoll“): „Zur Unterschrift senden“ erzeugt das Protokoll frisch als
 * PDF und öffnet den Anforderungs-Dialog mit den Rollen aus der Versammlung.
 * RGI-Rollen unterschreiben in der Box mit der hinterlegten Unterschrift,
 * alle anderen per persönlichem Link (online oder Papier per Upload/E-Mail).
 * Nach Abschluss liegt das Protokoll im DMS; versendet wird es wie bisher
 * über „Rundmail an Eigentümer“.
 *
 * Altstand: Versammlungen, die noch im bisherigen Verfahren (etv_protocol_signatures)
 * unterschrieben wurden, zeigen diese Unterschriften hier lesend an.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UnterschriftenBox } from "@/components/signatur/UnterschriftenBox";
import type { UnterschriftStartInfo, VorschlagOption, VorschlagSigner } from "@/components/signatur/UnterschriftAnfordernDialog";
import { formatShortDate, useBueroMitarbeiter, useSignRequestsForQuelle } from "@/lib/signatur";
import { contactEmail, contactName, useAttendees } from "./useAttendees";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const ALT_ROLLEN: Record<string, string> = {
  leiter: "Versammlungsleiter",
  protokollant: "Protokollführer",
  eigentuemer: "Eigentümer",
  beirat: "Beirat",
};
const ALT_REIHE = ["leiter", "protokollant", "eigentuemer", "beirat"];

const norm = (s: string | null | undefined) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

const anredeVon = (c: any): string | null => {
  const s = norm(c?.salutation);
  if (c?.last_name && (s === "herr" || s === "hr." || s === "hr")) return `Guten Tag Herr ${c.last_name}`;
  if (c?.last_name && (s === "frau" || s === "fr." || s === "fr")) return `Guten Tag Frau ${c.last_name}`;
  return null;
};

interface Props {
  meeting: any;
  /** Öffnet den bestehenden Versand „Rundmail an Eigentümer“. */
  onRundmail?: () => void;
}

export function EtvUnterschriften({ meeting, onRundmail }: Props) {
  const meetingId = meeting.id as string;
  const qc = useQueryClient();
  const { data: mitarbeiter = [] } = useBueroMitarbeiter();
  const { data: attendees = [] } = useAttendees(meetingId);
  const { data: vorgaenge = [] } = useSignRequestsForQuelle("etv_meeting", meetingId);
  const ended = meeting.status === "completed" || !!meeting.ended_at;

  // Bisheriges Verfahren (nur lesen)
  const { data: altUnterschriften = [] } = useQuery({
    queryKey: ["etv-protocol-signatures", meetingId],
    queryFn: async () =>
      ((await supabase.from("etv_protocol_signatures").select("role, signer_name, signed_at").eq("meeting_id", meetingId)).data || []) as {
        role: string;
        signer_name: string;
        signed_at: string | null;
      }[],
  });

  // Beirat und Eigentümer des Objekts
  const { data: objekt = [] } = useQuery({
    queryKey: ["etv-sign-objekt-kontakte", meeting.building_id],
    enabled: !!meeting.building_id,
    queryFn: async () => {
      const { data } = await db
        .from("contact_building_assignments")
        .select("contact_id, role_in_building, is_beirat, is_beirat_vorsitz, is_active, valid_to, contacts(id, first_name, last_name, company_name, salutation, contact_emails(email, is_primary))")
        .eq("building_id", meeting.building_id);
      const heute = new Date().toISOString().slice(0, 10);
      return ((data || []) as any[]).filter((a) => a.is_active !== false && (!a.valid_to || a.valid_to >= heute) && a.contacts);
    },
    staleTime: 5 * 60_000,
  });

  // Nach Abschluss: Versammlung neu laden (protocol_filed_at, unterschriebenes PDF)
  const status = vorgaenge.find((v) => v.status === "offen" || v.status === "abgeschlossen")?.status;
  const vorher = useRef(status);
  useEffect(() => {
    if (vorher.current === "offen" && status === "abgeschlossen") {
      qc.invalidateQueries({ queryKey: ["etv-meeting", meetingId] });
      qc.invalidateQueries({ queryKey: ["etv-signed-render", meetingId] });
      qc.invalidateQueries({ queryKey: ["etv-protocol-signatures", meetingId] });
      qc.invalidateQueries({ queryKey: ["etv-meetings"] });
    }
    vorher.current = status;
  }, [status, meetingId, qc]);

  /** Name aus der Versammlung → RGI-Mitarbeiter (intern) oder externer Unterzeichner. */
  const rolle = (name: string | null | undefined, label: string, key: string): VorschlagSigner => {
    const n = norm(name);
    const m = n
      ? mitarbeiter.find((x) => norm(x.name) === n) ??
        mitarbeiter.find((x) => {
          const teile = norm(x.name).split(" ");
          return teile.length > 1 && teile.every((t) => n.includes(t));
        })
      : undefined;
    if (m) return { name: m.name, rolle: label, rolle_key: key, methode: "intern", user_id: m.user_id };
    if (!n) return { name: "", rolle: label, rolle_key: key, methode: "intern", user_id: null };
    // Externe Person: E-Mail aus den Kontakten des Objekts, wenn der Name passt
    const k = objekt.find((a) => norm(contactName(a.contacts)) === n);
    return {
      name: String(name).replace(/\s+/g, " ").trim(),
      email: k ? contactEmail(k.contacts) : null,
      contact_id: k?.contact_id ?? null,
      anrede: k ? anredeVon(k.contacts) : null,
      rolle: label,
      rolle_key: key,
      methode: "online",
    };
  };

  const vorbereiten = async (): Promise<UnterschriftStartInfo> => {
    // Protokoll frisch als PDF erzeugen, damit genau der aktuelle Stand unterschrieben wird
    const { data, error } = await supabase.functions.invoke("etv-render-protocol", {
      body: { meeting_id: meetingId, output_format: "pdf", file_to_dms: false },
    });
    if (error) {
      let msg = error.message;
      try {
        const b = await (error as any)?.context?.json?.();
        if (b?.error) msg = b.error;
      } catch {
        /* Standardtext */
      }
      throw new Error(`Protokoll-PDF konnte nicht erstellt werden: ${msg}`);
    }
    if (data?.error || !data?.storage_path) throw new Error(`Protokoll-PDF konnte nicht erstellt werden${data?.error ? `: ${data.error}` : ""}.`);

    // Eigentümer: zuerst anwesende Teilnehmer, dann übrige Eigentümer des Objekts
    const optionen: VorschlagOption[] = [];
    const gesehen = new Set<string>();
    const sortiert = [...attendees].sort(
      (a: any, b: any) => Number(b.attendance_type === "present") - Number(a.attendance_type === "present"),
    );
    for (const a of sortiert) {
      const c = a.contact_building_assignments?.contacts;
      if (!c || gesehen.has(c.id)) continue;
      gesehen.add(c.id);
      optionen.push({
        name: contactName(c), email: contactEmail(c), contact_id: c.id, anrede: anredeVon(c),
        hinweis: a.attendance_type === "present" ? "war anwesend" : a.attendance_type === "proxy" ? "vertreten" : null,
      });
    }
    for (const a of objekt) {
      if (a.role_in_building !== "eigentuemer" || gesehen.has(a.contact_id)) continue;
      gesehen.add(a.contact_id);
      optionen.push({ name: contactName(a.contacts), email: contactEmail(a.contacts), contact_id: a.contact_id, anrede: anredeVon(a.contacts) });
    }

    const vorschlag: VorschlagSigner[] = [
      rolle(meeting.meeting_chair, "Versammlungsleiter", "leiter"),
      rolle(meeting.minutes_taker, "Protokollführer", "protokollant"),
      { name: "", rolle: "Eigentümer", rolle_key: "eigentuemer", methode: "online", optionen },
    ];

    // Beirat nur, wenn es einen gibt (Vorsitz bevorzugt)
    const beirat = objekt
      .filter((a) => a.is_beirat || a.is_beirat_vorsitz || a.role_in_building === "beirat")
      .sort((a, b) => Number(!!b.is_beirat_vorsitz) - Number(!!a.is_beirat_vorsitz));
    if (beirat.length) {
      const b = beirat[0];
      vorschlag.push({
        name: contactName(b.contacts),
        email: contactEmail(b.contacts),
        contact_id: b.contact_id,
        anrede: anredeVon(b.contacts),
        rolle: b.is_beirat_vorsitz ? "Beiratsvorsitz" : "Beirat",
        rolle_key: "beirat",
        methode: "online",
        optionen: beirat.length > 1
          ? beirat.map((x) => ({ name: contactName(x.contacts), email: contactEmail(x.contacts), contact_id: x.contact_id, anrede: anredeVon(x.contacts), hinweis: x.is_beirat_vorsitz ? "Vorsitz" : null }))
          : undefined,
      });
    }

    const d = meeting.meeting_date ? new Date(meeting.meeting_date) : null;
    const datum = d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "";
    const jahr = d ? d.getFullYear() : new Date().getFullYear();
    const objektName = meeting.buildings?.name || "";
    return {
      typ: "etv_protokoll",
      dokumentart: "protokoll",
      titel: `${meeting.title || "Eigentümerversammlung"}${datum ? ` vom ${datum}` : ""}`,
      building_id: meeting.building_id ?? null,
      quelle_label: `ETV ${jahr}${objektName ? ` · ${objektName}` : ""}`,
      source_bucket: "building-files",
      source_path: data.storage_path,
      vorschlagUnterzeichner: vorschlag,
      rgiZeile: false,
    };
  };

  const alt = [...altUnterschriften].sort((a, b) => ALT_REIHE.indexOf(a.role) - ALT_REIHE.indexOf(b.role));

  const ohneVorgang = alt.length ? (
    <div>
      <div className="mb-2.5 text-[13px] font-semibold text-[#1E6B34]">Unterschrieben (bisheriges Verfahren)</div>
      <div className="space-y-2.5">
        {alt.map((s) => (
          <div key={s.role} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="break-words text-[14px] font-semibold leading-snug text-[#2B2B2B]">
                {ALT_ROLLEN[s.role] ?? s.role} · {s.signer_name}
              </div>
              <div className="text-[12.5px] leading-snug text-[#6B6B6B]">in der App unterschrieben</div>
            </div>
            <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[13px] font-semibold text-[#1E6B34]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              {formatShortDate(s.signed_at)}
            </span>
          </div>
        ))}
      </div>
      {meeting.protocol_filed_at && (
        <p className="mt-3 text-[12.5px] text-[#595959]">
          Protokoll abgelegt am {new Date(meeting.protocol_filed_at).toLocaleDateString("de-DE")}.
        </p>
      )}
    </div>
  ) : (
    <p className="text-[14px] leading-snug text-[#595959]">
      {ended
        ? "Versammlungsleitung, Protokollführung und ein Eigentümer unterschreiben – bei einem Beirat zusätzlich der Vorsitz (§ 24 Abs. 6 WEG)."
        : "Zur Unterschrift senden ist möglich, sobald die Versammlung beendet ist."}
    </p>
  );

  return (
    <UnterschriftenBox
      quelleTyp="etv_meeting"
      quelleId={meetingId}
      startInfo={null}
      vorbereiten={ended ? vorbereiten : undefined}
      startText={alt.length && meeting.protocol_filed_at ? "Erneut zur Unterschrift senden" : "Zur Unterschrift senden"}
      ohneVorgang={ohneVorgang}
      abgeschlossenHinweis={
        <>
          Protokoll ist unterschrieben und im DMS abgelegt – jetzt über{" "}
          {onRundmail ? (
            <button type="button" onClick={onRundmail} className="font-semibold underline underline-offset-2">
              „Rundmail an Eigentümer“
            </button>
          ) : (
            "„Rundmail an Eigentümer“"
          )}{" "}
          versenden.
        </>
      }
    />
  );
}
