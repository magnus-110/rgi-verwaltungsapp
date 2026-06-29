import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Download, FileText, ArrowLeft, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function WegOwnerServiceHubSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("order_id");
  const [order, setOrder] = useState<any | null>(null);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaitedTooLong(true), 90_000);
    return () => clearTimeout(t);
  }, [orderId]);

  const handleRetry = async () => {
    if (!orderId) return;
    setRetrying(true);
    try {
      const { error } = await supabase.functions.invoke("generate-service-document", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      toast.success("Dokumenterstellung wurde neu gestartet.");
      setWaitedTooLong(false);
      // refresh order
      const { data } = await supabase.from("service_orders").select("*").eq("id", orderId).maybeSingle();
      setOrder(data);
    } catch (e: any) {
      toast.error(e.message || "Neustart fehlgeschlagen");
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (!orderId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("service_orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      setOrder(data);
    };
    fetch();

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "service_orders", filter: `id=eq.${orderId}` },
        (payload) => setOrder(payload.new as any),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const handleDownload = async (index?: number) => {
    if (!orderId) return;
    setDownloadingIndex(index ?? 0);
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-service-document-url",
        { body: { order_id: orderId, index } },
      );
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
      else throw new Error("Kein Download-Link erhalten");
    } catch (e: any) {
      toast.error(e.message || "Download fehlgeschlagen");
    } finally {
      setDownloadingIndex(null);
    }
  };

  const ready = order?.status === "document_ready" && order?.document_storage_path;
  const errored = order?.status === "document_error" || (!ready && order?.document_error);
  const paid = order?.status === "paid" || ready || errored;

  const docs: Array<{ index: number; mieter_name?: string }> =
    ready && Array.isArray(order?.document_paths) && order.document_paths.length
      ? order.document_paths
      : ready
        ? [{ index: 1 }]
        : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/weg-owner/service-hub")}
        className="mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Service-Hub
      </Button>

      <Card className="p-8 text-center space-y-4">
        {!order ? (
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
        ) : (
          <>
            {errored ? (
              <AlertTriangle className="w-16 h-16 text-amber-600 mx-auto" />
            ) : (
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            )}
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "Century Gothic, sans-serif" }}
            >
              Vielen Dank für Ihre Bestellung
            </h1>
            <div className="flex justify-center gap-2">
              <Badge variant={paid ? "default" : "secondary"}>
                {paid ? "Bezahlt" : order.status}
              </Badge>
              <Badge variant={ready ? "default" : errored ? "destructive" : "secondary"}>
                {ready ? "Dokument bereit" : errored ? "Fehler bei Erstellung" : "Dokument wird erstellt"}
              </Badge>
            </div>

            {ready ? (
              <>
                <p className="text-muted-foreground text-sm">
                  {docs.length > 1
                    ? "Ihre Dokumente sind fertig."
                    : "Ihr Dokument ist fertig."}
                </p>
                <div className="flex flex-col items-center gap-2">
                  {docs.map((d) => (
                    <Button
                      key={d.index}
                      onClick={() => handleDownload(docs.length > 1 ? d.index : undefined)}
                      disabled={downloadingIndex !== null}
                      size="lg"
                      className="w-full sm:w-auto"
                    >
                      {downloadingIndex === d.index ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      PDF herunterladen
                      {d.mieter_name ? ` – ${d.mieter_name}` : ""}
                    </Button>
                  ))}
                </div>
              </>
            ) : errored ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-700">
                  Bei der Erstellung Ihres Dokuments ist ein Fehler aufgetreten.
                </p>
                {order.document_error && (
                  <p className="text-xs text-muted-foreground bg-muted rounded p-2 break-words">
                    {order.document_error}
                  </p>
                )}
                <Button onClick={handleRetry} disabled={retrying} size="lg">
                  {retrying ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Erneut versuchen
                </Button>
                <p className="text-xs text-muted-foreground">
                  Falls der Fehler bestehen bleibt, melden Sie sich bei{" "}
                  <a className="underline" href="mailto:info@rgi-immobilien.de">
                    info@rgi-immobilien.de
                  </a>
                  .
                </p>
              </div>
            ) : paid ? (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wir erstellen Ihr Dokument. Sie können diese Seite offen lassen.
                </p>
                {waitedTooLong && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Das dauert ungewöhnlich lange. Sie können die Erstellung neu starten.
                    </p>
                    <Button onClick={handleRetry} disabled={retrying} size="sm" variant="outline">
                      {retrying ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Erneut versuchen
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Sobald die Zahlung bestätigt ist, geht es hier weiter.
              </p>
            )}

            {order.stripe_invoice_hosted_url && (
              <div className="pt-4 border-t">
                <a
                  href={order.stripe_invoice_hosted_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline inline-flex items-center gap-1"
                >
                  <FileText className="w-4 h-4" />
                  Rechnung von Stripe anzeigen
                </a>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
