import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useHasVisibleFiles(userId: string | undefined) {
  const [hasFiles, setHasFiles] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;

    const check = async () => {
      // Check if user has any visible personal or building files
      const [personalRes, buildingRes] = await Promise.all([
        supabase
          .from("building_files")
          .select("id", { count: "exact", head: true })
          .eq("assigned_user_id", userId)
          .eq("visible_to_users", true),
        supabase
          .from("building_files")
          .select("id", { count: "exact", head: true })
          .is("assigned_user_id", null)
          .eq("visible_to_users", true),
      ]);

      const total = (personalRes.count ?? 0) + (buildingRes.count ?? 0);
      setHasFiles(total > 0);
    };

    check();
  }, [userId]);

  return hasFiles;
}
