export const TIME_SLOTS = ["15", "17", "19"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];
export type PollChoice = "yes" | "maybe" | "no";

export const slotLabel = (s: string) => `ab ${s}:00 Uhr`;

export const formatGermanDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export const formatShortDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export interface PollResponseRow {
  option_id: string;
  contact_id: string;
  choice: PollChoice;
  earliest_time: string | null;
}

export interface OptionEvaluation {
  optionId: string;
  date: string;
  yes: number;
  maybe: number;
  no: number;
  score: number;
  responded: number;
  /** cumulative availability per slot: "ab 15:00" also counts for 17 and 19 */
  slotAvailability: Record<TimeSlot, number>;
  bestSlot: TimeSlot;
  bestSlotCount: number;
}

export function evaluateOptions(
  options: { id: string; proposed_date: string }[],
  responses: PollResponseRow[],
): OptionEvaluation[] {
  const evaluated = options.map((opt) => {
    const rows = responses.filter((r) => r.option_id === opt.id);
    const yes = rows.filter((r) => r.choice === "yes").length;
    const maybe = rows.filter((r) => r.choice === "maybe").length;
    const no = rows.filter((r) => r.choice === "no").length;

    const slotAvailability = { "15": 0, "17": 0, "19": 0 } as Record<TimeSlot, number>;
    rows
      .filter((r) => r.choice !== "no" && r.earliest_time)
      .forEach((r) => {
        // "ab 15:00" means the owner can also do 17:00 and 19:00
        TIME_SLOTS.forEach((slot) => {
          if (Number(slot) >= Number(r.earliest_time)) slotAvailability[slot] += 1;
        });
      });

    let bestSlot: TimeSlot = "19";
    let bestSlotCount = -1;
    TIME_SLOTS.forEach((slot) => {
      if (slotAvailability[slot] > bestSlotCount) {
        bestSlot = slot;
        bestSlotCount = slotAvailability[slot];
      }
    });

    return {
      optionId: opt.id,
      date: opt.proposed_date,
      yes,
      maybe,
      no,
      score: yes * 2 + maybe,
      responded: rows.length,
      slotAvailability,
      bestSlot,
      bestSlotCount: Math.max(bestSlotCount, 0),
    };
  });

  return evaluated.sort(
    (a, b) => a.no - b.no || b.score - a.score || b.bestSlotCount - a.bestSlotCount,
  );
}
