import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Eye,
  EyeOff,
  Fingerprint,
  FileText,
  Wrench,
  Scale,
  Users,
  MessageCircle,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAuthErrorMessage } from "@/lib/authErrorMessage";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { BackendStatusBanner } from "@/components/system/BackendStatusBanner";

// Vorteile der App für Eigentümer – werden auf der Anmeldeseite angezeigt
// (Desktop: links in der dunklen Fläche, Smartphone: unter dem Formular).
const VORTEILE: { icon: LucideIcon; titel: string; text: string; textKurz: string }[] = [
  {
    icon: FileText,
    titel: "Alle Unterlagen griffbereit",
    text: "Abrechnungen, Protokolle und wichtige Dokumente – jederzeit abrufbar, statt im Ordner gesucht.",
    textKurz: "Abrechnungen, Protokolle und wichtige Dokumente – jederzeit abrufbar.",
  },
  {
    icon: Wrench,
    titel: "Schäden schnell melden",
    text: "In wenigen Schritten gemeldet – und Sie sehen jederzeit, wie weit die Bearbeitung ist.",
    textKurz: "In wenigen Schritten gemeldet – den Stand der Bearbeitung sehen Sie jederzeit.",
  },
  {
    icon: Scale,
    titel: "Beschlüsse nachlesen",
    text: "Was wurde wann entschieden? Alle Beschlüsse Ihrer Gemeinschaft an einem Ort.",
    textKurz: "Alle Beschlüsse Ihrer Gemeinschaft an einem Ort.",
  },
  {
    icon: Users,
    titel: "Mitreden und mitbestimmen",
    text: "Versammlungen vorbereiten, bei Umfragen und Terminen abstimmen, am Schwarzen Brett austauschen.",
    textKurz: "Versammlungen vorbereiten, bei Umfragen und Terminen abstimmen, am Schwarzen Brett austauschen.",
  },
  {
    icon: MessageCircle,
    titel: "Antworten rund um die Uhr",
    text: "Der digitale Assistent beantwortet Fragen zu Ihrer Anlage – auch abends und am Wochenende.",
    textKurz: "Der digitale Assistent hilft auch abends und am Wochenende.",
  },
  {
    icon: Receipt,
    titel: "Extra-Service für Vermieter",
    text: "Die Nebenkostenabrechnung für Ihren Mieter erstellen wir auf Wunsch direkt aus Ihren Daten.",
    textKurz: "Die Nebenkostenabrechnung für Ihren Mieter erstellen wir auf Wunsch direkt aus Ihren Daten.",
  },
];

const HEADING_FONT = "font-['Jost',_'Century_Gothic',_sans-serif]";

const DachMotiv = ({ className }: { className: string }) => (
  <svg aria-hidden="true" viewBox="0 0 520 420" fill="none" className={className}>
    <path d="M40 420V190L260 36L480 190V420" stroke="#ee7202" strokeOpacity="0.13" strokeWidth="30" />
  </svg>
);

export const Login = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const passkeySupported =
    typeof window !== "undefined" && !!(window as any).PublicKeyCredential;
  const { signIn, user, profile } = useAuth();
  const { reportError } = useBackendHealth();

  // Passkey-Anmeldung wird ausschließlich durch Klick auf den Passkey-Button
  // ausgelöst – kein automatischer Conditional-UI-Prompt beim Seitenaufruf.

  // Redirect authenticated users
  if (user && profile) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(identifier, password);
      if (error) {
        // signIn zeigt bereits einen Toast; hier nur Health-Check auslösen
        reportError(error);
      }
    } catch (error) {
      reportError(error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    const auth = supabase.auth as any;
    if (typeof auth.signInWithPasskey !== "function") {
      toast.error("Passkey-Anmeldung ist nicht verfügbar.");
      return;
    }
    setPasskeyLoading(true);
    try {
      const { error } = await auth.signInWithPasskey();
      if (error) {
        if (error.name === "NotAllowedError" || error.code === "user_cancelled") return;
        reportError(error);
        toast.error(getAuthErrorMessage(error));
      }
    } catch (e: any) {
      if (e?.name === "NotAllowedError") return;
      reportError(e);
      toast.error(getAuthErrorMessage(e));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling to parent form
    setResetLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('request-password-reset', {
        body: { email: resetEmail }
      });

      if (error) {
        // Try to extract specific error message from the function response body
        let specificMessage: string | null = null;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) specificMessage = body.error;
          } else if (ctx && typeof ctx.text === 'function') {
            const txt = await ctx.text();
            try {
              const parsed = JSON.parse(txt);
              if (parsed?.error) specificMessage = parsed.error;
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }

        toast.error(specificMessage ?? 'Fehler beim Zurücksetzen des Passworts. Bitte versuchen Sie es später erneut.');
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // Success case
      toast.success("Neues Passwort wurde generiert und per E-Mail versendet!");
      setResetDialogOpen(false);
      setResetEmail("");
    } catch (error: any) {

      toast.error('Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#faf8f5] text-[#4a4849]">
      {/* ── Dunkle Fläche: Logo + Botschaften ── */}
      <aside className="relative overflow-hidden bg-[#2f2d2e] text-[#f4f1ec] flex flex-col justify-between gap-8 px-6 pt-10 pb-9 sm:px-10 lg:w-[54%] lg:max-w-[780px] lg:shrink-0 lg:min-h-screen lg:px-[72px] lg:pt-[52px] lg:pb-11">
        <DachMotiv className="pointer-events-none absolute -right-[150px] -bottom-[150px] w-[340px] h-[275px] lg:-bottom-[110px] lg:w-[520px] lg:h-[420px]" />

        {/* Farbfilter: macht die grauen Logo-Teile weiß, das Orange bleibt –
            so passt das vorhandene Logo auf die dunkle Fläche. */}
        <svg aria-hidden="true" width="0" height="0" className="absolute">
          <filter id="rgi-logo-hell" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="1 0 1.68 0 0  0 1 1.66 0 0  0 0 2.63 0 0  0 0 0 1 0"
            />
          </filter>
        </svg>
        <img
          src="/lovable-uploads/8cc4ac02-ecfc-41ef-945a-738115d31106.png"
          alt="RGI Immobilien – Verkauf, Vermietung, Verwaltung"
          className="relative w-[170px] lg:w-[200px] h-auto"
          style={{ filter: "url(#rgi-logo-hell)" }}
        />

        <div className="relative flex flex-col gap-3 lg:gap-5">
          <div className="text-xs lg:text-[13px] font-semibold tracking-[0.14em] uppercase text-[#f59a4a]">
            Die Verwaltungsapp
          </div>
          <h2 className={`${HEADING_FONT} m-0 font-medium text-[32px] lg:text-[50px] leading-[1.08] tracking-[-0.02em] text-white`}>
            Ihre Immobilie.<br />Jederzeit im Blick.
          </h2>
          <p className="m-0 max-w-[600px] text-[15px] lg:text-[17px] leading-relaxed text-[#d2ccc5]">
            Kein Suchen in Ordnern, kein Warten auf Bürozeiten: Hier haben Sie alles rund um Ihre
            Eigentumswohnung griffbereit – am Computer und auf dem Handy. Ihr direkter Draht zur Hausverwaltung.
          </p>

          {/* Vorteile – nur auf großen Bildschirmen hier */}
          <ul className="hidden lg:grid grid-cols-2 gap-x-10 gap-y-[26px] mt-[18px] list-none p-0">
            {VORTEILE.map(({ icon: Icon, titel, text }) => (
              <li key={titel} className="flex gap-3.5 items-start">
                <div className="w-[38px] h-[38px] shrink-0 rounded-[10px] bg-[#ee7202]/[0.14] text-[#f59a4a] flex items-center justify-center">
                  <Icon className="w-[19px] h-[19px]" strokeWidth={1.7} aria-hidden="true" />
                </div>
                <div>
                  <div className="font-semibold text-white text-base">{titel}</div>
                  <div className="text-sm leading-normal text-[#bdb6ae]">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative hidden lg:block text-[13px] text-[#a8a19a]">
          RGI Immobilien GmbH &amp; Co. KG · Ihre Verwaltung vor Ort in Pfronten
        </div>
      </aside>

      {/* ── Anmeldung ── */}
      <main className="flex-1 flex flex-col px-6 pt-8 pb-8 sm:px-10 lg:px-16 lg:pt-12 lg:pb-9">
        <div className="w-full max-w-[400px] mx-auto">
          <BackendStatusBanner />
        </div>

        <div className="flex-1 flex items-center justify-center">
          <form onSubmit={handleSubmit} className="w-full max-w-[400px] flex flex-col gap-5">
            <div className="flex flex-col gap-2 mb-1 lg:mb-2">
              <h1 className={`${HEADING_FONT} m-0 font-medium text-[28px] lg:text-4xl tracking-[-0.02em] text-[#2f2d2e]`}>
                Anmelden
              </h1>
              <p className="m-0 text-[15px] lg:text-base text-[#6b6667]">
                Willkommen zurück. Bitte melden Sie sich mit Ihren Zugangsdaten an.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="identifier" className="text-sm font-medium text-[#4a4849]">
                Benutzername oder E-Mail
              </Label>
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="z. B. max.mustermann"
                required
                className="h-[52px] rounded-[10px] border-[#e2dbd2] bg-white px-4 text-base text-[#2f2d2e] placeholder:text-[#8f8a86] focus-visible:ring-[#ee7202]/40 focus-visible:border-[#ee7202]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="password" className="text-sm font-medium text-[#4a4849]">
                  Passwort
                </Label>
                <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="text-sm font-medium text-[#b35300] hover:text-[#8a4000] transition-colors"
                    >
                      Passwort vergessen?
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Passwort zurücksetzen</DialogTitle>
                      <DialogDescription>
                        Geben Sie Ihre E-Mail-Adresse ein, um ein neues Passwort zu erhalten.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePasswordReset} className="space-y-4">
                      <div>
                        <Label htmlFor="reset-email">E-Mail-Adresse</Label>
                        <Input
                          id="reset-email"
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setResetDialogOpen(false)}
                          className="flex-1"
                        >
                          Abbrechen
                        </Button>
                        <Button type="submit" disabled={resetLoading} className="flex-1">
                          {resetLoading ? "Wird gesendet..." : "Neues Passwort anfordern"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-[52px] rounded-[10px] border-[#e2dbd2] bg-white pl-4 pr-[52px] text-base text-[#2f2d2e] placeholder:text-[#8f8a86] focus-visible:ring-[#ee7202]/40 focus-visible:border-[#ee7202]"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                  className="absolute right-1 top-1 w-11 h-11 flex items-center justify-center text-[#8f8a86] hover:text-[#4a4849] transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-[54px] mt-1 rounded-[10px] bg-[#2f2d2e] hover:bg-[#1f1d1e] text-white text-base font-semibold"
            >
              {loading ? "Anmelden..." : "Anmelden"}
            </Button>

            {passkeySupported && (
              <>
                <div className="flex items-center gap-3.5 text-[13px] text-[#8f8a86]">
                  <span className="flex-1 h-px bg-[#e2dbd2]" />
                  <span>oder</span>
                  <span className="flex-1 h-px bg-[#e2dbd2]" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="h-[52px] rounded-[10px] border-[#d8d0c6] bg-white hover:bg-[#f6f2ec] text-[#2f2d2e] text-[15px] font-medium gap-2.5"
                >
                  <Fingerprint className="h-5 w-5 text-[#ee7202]" />
                  {passkeyLoading ? "Anmelden…" : "Mit Passkey anmelden"}
                </Button>
              </>
            )}
          </form>
        </div>

        {/* Vorteile – auf dem Smartphone unter dem Formular */}
        <section className="lg:hidden w-full max-w-[400px] mx-auto mt-10 pt-7 border-t border-[#e8e2da] flex flex-col gap-[22px]">
          <h2 className={`${HEADING_FONT} m-0 font-medium text-[22px] tracking-[-0.01em] text-[#2f2d2e]`}>
            Was Sie in der App erwartet
          </h2>
          <ul className="flex flex-col gap-[22px] list-none p-0 m-0">
            {VORTEILE.map(({ icon: Icon, titel, textKurz }) => (
              <li key={titel} className="flex gap-3.5 items-start">
                <div className="w-9 h-9 shrink-0 rounded-[10px] bg-[#fbe9d8] text-[#b35300] flex items-center justify-center">
                  <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} aria-hidden="true" />
                </div>
                <div>
                  <div className="font-semibold text-[#2f2d2e] text-[15px]">{titel}</div>
                  <div className="text-sm leading-normal text-[#6b6667]">{textKurz}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-10 lg:mt-6 flex flex-col lg:flex-row items-center lg:justify-between gap-2.5 text-center text-[13px] text-[#6b6667]">
          <span>Probleme bei der Anmeldung? Wenden Sie sich an Ihre Verwaltung.</span>
          <span className="flex gap-5">
            <Link to="/legal/datenschutz" className="underline underline-offset-2 hover:text-[#2f2d2e]">Datenschutz</Link>
            <Link to="/legal/agb" className="underline underline-offset-2 hover:text-[#2f2d2e]">AGB</Link>
          </span>
        </footer>
      </main>
    </div>
  );
};
