import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useReportByNumber, useReportForEmail } from "@/hooks/useReports";
import { CreateReportDialog } from "./CreateReportDialog";

const NUMBER_IN_SUBJECT = /\[?(M-\d{2}-\d{4})\]?/;

interface EmailLike {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  body_text?: string | null;
  building_id?: string | null;
}

/** Hinweis in einer E-Mail, die zu einer Meldung gehört (Nummer im Betreff oder daraus übernommen). */
export function EmailReportBadge({ email, onOpenReport }: { email: EmailLike; onOpenReport: (id: string) => void }) {
  const number = email.subject?.match(NUMBER_IN_SUBJECT)?.[1] ?? null;
  const { data: fromEmail } = useReportForEmail(email.id);
  const { data: byNumber } = useReportByNumber(fromEmail ? null : number);
  const hit = fromEmail || byNumber;
  if (!hit) return null;
  return (
    <Badge variant="default" className="cursor-pointer gap-1" onClick={() => onOpenReport(hit.id)}>
      <ClipboardList className="h-3 w-3" />
      Meldung {hit.report_number}
    </Badge>
  );
}

/** Knopf „Als Meldung übernehmen“ in der Fußleiste einer E-Mail. */
export function EmailToReportButton({ email, onCreated }: { email: EmailLike; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: existing } = useReportForEmail(email.id);
  if (existing) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <ClipboardList className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Als Meldung übernehmen</span>
        <span className="sm:hidden">Meldung</span>
      </Button>
      <CreateReportDialog
        open={open}
        onOpenChange={setOpen}
        prefill={{
          title: (email.subject || "").replace(/^(re|aw|fwd?|wg):\s*/i, ""),
          description: email.body_text || "",
          contactName: email.from_name || "",
          contactEmail: email.from_address || "",
          buildingId: email.building_id ?? null,
          sourceEmailId: email.id,
        }}
        onCreated={(r) => onCreated(r.id)}
      />
    </>
  );
}
