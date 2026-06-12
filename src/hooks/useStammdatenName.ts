import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Liest Vor-/Nachnamen aus dem an den User gekoppelten Kontakt
 * (contacts.user_id = auth.uid()) und hält sie via Realtime synchron.
 * Fallback: profiles.first_name / last_name.
 */
export function useStammdatenName() {
  const { user, profile } = useAuth();
  const [firstName, setFirstName] = useState<string | null>(profile?.first_name ?? null);
  const [lastName, setLastName] = useState<string | null>(profile?.last_name ?? null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const fetchContact = async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.first_name) setFirstName(data.first_name);
      else if (profile?.first_name) setFirstName(profile.first_name);
      if (data?.last_name) setLastName(data.last_name);
      else if (profile?.last_name) setLastName(profile.last_name);
    };

    fetchContact();

    const channel = supabase
      .channel(`contacts-stammdaten-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contacts", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { first_name?: string | null; last_name?: string | null };
          if (row.first_name !== undefined) setFirstName(row.first_name || profile?.first_name || null);
          if (row.last_name !== undefined) setLastName(row.last_name || profile?.last_name || null);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.first_name, profile?.last_name]);

  return { firstName, lastName };
}
