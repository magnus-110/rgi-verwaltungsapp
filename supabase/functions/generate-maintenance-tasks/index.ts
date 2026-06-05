import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MaintenanceTypeDef {
  key: string;
  label: string;
  defaultIntervalMonths: number;
  defaultLeadTimeDays: number;
  seasonal?: { allowedMonths: number[]; fallbackMonth: number; fallbackDay: number };
}

const MAINTENANCE_TYPES: MaintenanceTypeDef[] = [
  { key: "rauchmelder", label: "Rauchwarnmelder", defaultIntervalMonths: 12, defaultLeadTimeDays: 28 },
  { key: "feuerloescher", label: "Feuerlöscher", defaultIntervalMonths: 24, defaultLeadTimeDays: 28 },
  { key: "aufzug", label: "Aufzug Hauptprüfung", defaultIntervalMonths: 24, defaultLeadTimeDays: 56 },
  { key: "legionellen", label: "Legionellenprüfung", defaultIntervalMonths: 36, defaultLeadTimeDays: 56 },
  { key: "heizung", label: "Heizungswartung", defaultIntervalMonths: 12, defaultLeadTimeDays: 42 },
  { key: "wasserzaehler", label: "Wasserzähler Eichung", defaultIntervalMonths: 72, defaultLeadTimeDays: 84 },
  { key: "hebeanlage", label: "Hebeanlage", defaultIntervalMonths: 6, defaultLeadTimeDays: 14 },
  { key: "tiefgaragentore", label: "Tiefgaragentore", defaultIntervalMonths: 12, defaultLeadTimeDays: 28 },
  { key: "energieausweis", label: "Energieausweis", defaultIntervalMonths: 120, defaultLeadTimeDays: 182 },
  { key: "gas_hausschau", label: "Gas-Hausschau", defaultIntervalMonths: 144, defaultLeadTimeDays: 56 },
  { key: "rueckspuelfilter", label: "Rückspülfilter", defaultIntervalMonths: 2, defaultLeadTimeDays: 7 },
  { key: "ventile", label: "Ventile gängig machen", defaultIntervalMonths: 6, defaultLeadTimeDays: 14 },
  { key: "dach_rinnen", label: "Dach & Rinnen", defaultIntervalMonths: 3, defaultLeadTimeDays: 14 },
  { key: "objektbegehung", label: "Objektbegehung", defaultIntervalMonths: 3, defaultLeadTimeDays: 7 },
  { key: "baumbeschnitt", label: "Baumbeschnitt", defaultIntervalMonths: 12, defaultLeadTimeDays: 28, seasonal: { allowedMonths: [10, 2], fallbackMonth: 10, fallbackDay: 1 } },
];

function getTypeDef(key: string): MaintenanceTypeDef | undefined {
  return MAINTENANCE_TYPES.find((t) => t.key === key);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function adjustForSeason(date: Date, seasonal: MaintenanceTypeDef["seasonal"]): Date {
  if (!seasonal) return date;
  const month = date.getMonth() + 1; // 1-based
  if (seasonal.allowedMonths.includes(month)) return date;
  // If between March and September, move to October 1st
  if (month >= 3 && month <= 9) {
    return new Date(date.getFullYear(), seasonal.fallbackMonth - 1, seasonal.fallbackDay);
  }
  // Nov-Jan: move to February 1st
  if (month >= 11 || month === 1) {
    const year = month >= 11 ? date.getFullYear() + 1 : date.getFullYear();
    return new Date(year, 1, 1); // February
  }
  return date;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let buildingId: string | null = null;
    let userId: string | null = null;

    // Parse request body (optional - cron calls may not have a body)
    try {
      const body = await req.json();
      buildingId = body.building_id || null;
      userId = body.user_id || null;
    } catch {
      // No body = cron job, process all buildings
    }

    // Fetch maintenance configs
    let configQuery = supabase
      .from("maintenance_configs")
      .select("*")
      .eq("is_active", true);

    if (buildingId) {
      configQuery = configQuery.eq("building_id", buildingId);
    }

    const { data: configs, error: configError } = await configQuery;
    if (configError) throw configError;

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ message: "Keine aktiven Wartungskonfigurationen gefunden", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 365);

    let totalCreated = 0;

    // Group configs by building
    const buildingConfigs = new Map<string, typeof configs>();
    for (const config of configs) {
      const existing = buildingConfigs.get(config.building_id) || [];
      existing.push(config);
      buildingConfigs.set(config.building_id, existing);
    }

    for (const [bId, bConfigs] of buildingConfigs) {
      // Get a user_id for created_by - use provided userId or find an admin
      let createdBy = userId;
      if (!createdBy) {
        const { data: managers } = await supabase
          .from("building_managers")
          .select("user_id")
          .eq("building_id", bId)
          .limit(1);
        if (managers && managers.length > 0) {
          createdBy = managers[0].user_id;
        } else {
          // Fallback: find any admin
          const { data: admins } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("role", "admin")
            .limit(1);
          if (admins && admins.length > 0) {
            createdBy = admins[0].user_id;
          }
        }
      }

      if (!createdBy) continue;

      // Fetch existing maintenance tasks for this building
      const { data: existingTasks } = await supabase
        .from("todos")
        .select("id, maintenance_type, due_date")
        .eq("is_maintenance_task", true)
        .eq("building_id", bId)
        .gte("due_date", formatDate(today));

      const existingSet = new Set(
        (existingTasks || []).map((t) => `${t.maintenance_type}_${t.due_date}`)
      );

      const tasksToInsert: any[] = [];

      for (const config of bConfigs) {
        const isCustom = String(config.maintenance_type).startsWith("custom_");
        const typeDef = isCustom ? null : getTypeDef(config.maintenance_type);
        if (!isCustom && !typeDef) continue;

        const defaultInterval = typeDef?.defaultIntervalMonths ?? 12;
        const defaultLead = typeDef?.defaultLeadTimeDays ?? 14;
        const intervalMonths = config.custom_interval_months || defaultInterval;
        const leadTimeDays = config.custom_lead_time_days || defaultLead;
        const label = typeDef?.label || config.custom_label || "Eigene Wartung";

        // Generate due dates: if last_maintenance_date is set, start from there + interval
        let cursor: Date;
        if (config.last_maintenance_date) {
          cursor = addMonths(new Date(config.last_maintenance_date), intervalMonths);
        } else {
          cursor = new Date(today);
        }

        let iterations = 0;
        while (cursor <= horizon && iterations < 100) {
          let dueDate = new Date(cursor);

          // Apply seasonal logic
          if (typeDef?.seasonal) {
            dueDate = adjustForSeason(dueDate, typeDef.seasonal);
          }

          // Only add if within horizon and not in past
          if (dueDate >= today && dueDate <= horizon) {
            const dueDateStr = formatDate(dueDate);
            const key = `${config.maintenance_type}_${dueDateStr}`;

            if (!existingSet.has(key)) {
              const showInListDate = subDays(dueDate, leadTimeDays);

              tasksToInsert.push({
                title: `${label} - Wartung`,
                description: label,
                due_date: dueDateStr,
                show_in_list_date: formatDate(showInListDate < today ? today : showInListDate),
                maintenance_type: config.maintenance_type,
                is_maintenance_task: true,
                building_id: bId,
                created_by: createdBy,
                priority: "medium",
                status: "open",
              });
              existingSet.add(key);
            }
          }

          cursor = addMonths(cursor, intervalMonths);
          iterations++;
        }
      }

      // Insert in batches
      if (tasksToInsert.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < tasksToInsert.length; i += batchSize) {
          const batch = tasksToInsert.slice(i, i + batchSize);
          const { error: insertError } = await supabase.from("todos").insert(batch);
          if (insertError) {
            console.error(`Error inserting batch for building ${bId}:`, insertError);
          } else {
            totalCreated += batch.length;
          }
        }

        // Update last_generated_date
        for (const config of bConfigs) {
          await supabase
            .from("maintenance_configs")
            .update({ last_generated_date: formatDate(today) })
            .eq("id", config.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `${totalCreated} Wartungsaufgaben erstellt`, created: totalCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating maintenance tasks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
