import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Phone, User } from "lucide-react";

type Hit = {
  contact_id: string;
  label: string;
  name: string;
  objekte: string | null;
  phone: string;
};

export default function IncomingCall() {
  const [params] = useSearchParams();
  const num = params.get("nummer") || "";
  const [loading, setLoading] = useState(true);
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    if (!num) {
      setLoading(false);
      return;
    }
    supabase.rpc("find_contact_by_phone", { p_num: num }).then(({ data }) => {
      const seen = new Set<string>();
      const unique = ((data || []) as Hit[]).filter((r) => {
        if (seen.has(r.contact_id)) return false;
        seen.add(r.contact_id);
        return true;
      });
      setHits(unique);
      setLoading(false);
    });
  }, [num]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Phone className="h-4 w-4" /> Eingehender Anruf · {num || "—"}
      </div>

      {loading && <p className="text-muted-foreground">Suche Kontakt…</p>}

      {!loading && hits.length === 0 && (
        <div className="space-y-1">
          <User className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-2xl font-semibold">Unbekannte Nummer</p>
          <p className="text-muted-foreground">{num}</p>
        </div>
      )}

      {!loading &&
        hits.map((h) => (
          <div key={h.contact_id} className="space-y-1">
            <p className="text-3xl font-bold">{h.name}</p>
            {h.objekte && <p className="text-muted-foreground">{h.objekte}</p>}
            <p className="text-sm text-muted-foreground">
              {h.label}: {h.phone}
            </p>
          </div>
        ))}
    </div>
  );
}
