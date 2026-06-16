import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ServiceType = "nebenkosten" | "anlage_v" | "mietvertrag";

export type ServicePricing = {
  service_type: ServiceType;
  price_cents: number;
  currency: string;
  active: boolean;
};

export function useServicePricing() {
  const [pricing, setPricing] = useState<Record<ServiceType, ServicePricing> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from("service_pricing")
      .select("*")
      .then(({ data }) => {
        if (!active) return;
        const map: any = {};
        (data ?? []).forEach((r: any) => (map[r.service_type] = r));
        setPricing(map);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { pricing, loading };
}

export function formatPrice(cents: number, currency = "eur"): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
