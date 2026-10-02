import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmailTemplatePicker } from "@/components/email/EmailTemplatePicker";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { Report, hasPortalAccess, useAddReportNote, useSendReportMessage } from "@/hooks/useReports";
import { errorMessage } from "@/lib/reports";

export type ComposerMode = "message" | "note";

interface Props {
  report: Report;
  mode: ComposerMode;
  onModeChange: (m: ComposerMode) => void;
  onClose: () => void;
}

/**
 * Schreibfeld unter dem Verlauf — wie bei großen Ticketsystemen mit zwei
 * Reitern: Nachricht an den Melder (erscheint im Portal) und interne Notiz
 * (sieht nur das Büro).
 */
export function ReportComposer({ report, mode, onModeChange, onClose }: Props) {
  const portal = hasPortalAccess(report);
  const firstName = (report.contact_name || "Melder").split(" ")[0];
  const [text, setText] = useState("");
  const [allowReply, setAllowReply] = useState(false);
  const [viaEmail, setViaEmail] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = useSendReportMessage();
  const addNote = useAddReportNote();
  const { openCompose } = useComposeEmail();

  useEffect(() => {
    setText("");
    setAllowReply(false);
    setViaEmail(false);
    setTimeout(() => ref.current?.focus(), 30);
  }, [mode, report.id]);

  const busy = send.isPending || addNote.isPending;
  const emailPossible = !!report.contact_email;
  const isNote = mode === "note";

  const submit = async () => {
    const body = text.trim();
    if (!body) {
      toast.error(isNote ? "Bitte eine Notiz schreiben" : "Bitte eine Nachricht schreiben");
      return;
    }
    try {
      if (isNote) {
        await addNote.mutateAsync({ reportId: report.id, body });
        toast.success("Notiz gespeichert");
      } else {
        const withEmail = !portal || viaEmail;
        if (withEmail && !emailPossible) {
          toast.error("Für diesen Melder ist keine E-Mail-Adresse hinterlegt");
          return;
        }
        await send.mutateAsync({ report, body, allowReply, viaEmail: withEmail });
        if (withEmail) {
          // Versendet wird über das gewohnte Fenster — mit Konto, Signatur und
          // der Nummer im Betreff, damit Antworten zuzuordnen sind.
          openCompose({
            prefill: {
              to: report.contact_email!,
              subject: `[${report.report_number}] ${report.title}`,
              bodyText: body,
            },
          });
        }
        toast.success(
          !portal
            ? "Gespeichert — bitte die E-Mail im Fenster absenden"
            : withEmail
              ? "Im Portal gesendet — E-Mail-Fenster geöffnet"
              : allowReply
                ? "Im Portal gesendet, Antwort möglich"
                : "Im Portal gesendet",
        );
      }
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Konnte nicht gespeichert werden"));
    }
  };

  return (
    <div className={cn("border-t bg-card", isNote && "bg-amber-500/[0.04]")}>
      <div className="flex items-center border-b px-2">
        <TabButton active={!isNote} onClick={() => onModeChange("message")}>
          {portal ? "Nachricht" : "E-Mail"} an {firstName}
        </TabButton>
        <TabButton active={isNote} note onClick={() => onModeChange("note")}>
          <Lock className="h-3 w-3" /> Interne Notiz
        </TabButton>
        <div className="flex-1" />
        {!isNote && (
          <EmailTemplatePicker
            context={{ to: report.contact_email || undefined, buildingId: report.building_id }}
            onInsert={({ body }) => setText((t) => (t.trim() ? `${t.trim()}\n\n${body}` : body))}
          />
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Schließen">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!isNote && !portal && (
        <p className="border-b bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-900 dark:text-amber-200">
          {firstName} hat keinen Portalzugang. Die Nachricht wird hier gespeichert und als E-Mail an{" "}
          {report.contact_email || "— keine Adresse hinterlegt —"} geöffnet.
        </p>
      )}

      <div className="px-3 py-2">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={4}
          placeholder={isNote ? "Nur fürs Büro sichtbar …" : `Nachricht an ${report.contact_name || "den Melder"} …`}
          className="min-h-[96px] resize-y border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2">
        {!isNote && portal && (
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px]">
              <Checkbox checked={allowReply} onCheckedChange={(v) => setAllowReply(!!v)} />
              {firstName} darf antworten
            </label>
            <label
              className={cn("flex items-center gap-1.5 text-[12.5px]", emailPossible ? "cursor-pointer" : "opacity-50")}
              title={emailPossible ? undefined : "Keine E-Mail-Adresse hinterlegt"}
            >
              <Checkbox checked={viaEmail} disabled={!emailPossible} onCheckedChange={(v) => setViaEmail(!!v)} />
              zusätzlich per E-Mail
            </label>
          </>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={submit} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : !isNote && <Send className="h-3.5 w-3.5" />}
          {isNote ? "Notiz speichern" : "Senden"}
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  note,
  onClick,
  children,
}: {
  active: boolean;
  note?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 border-b-2 px-3 py-2 text-[12.5px] transition-colors",
        active
          ? cn("font-semibold text-foreground", note ? "border-amber-500" : "border-primary")
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
