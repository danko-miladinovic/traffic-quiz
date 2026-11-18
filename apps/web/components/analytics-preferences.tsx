"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { trafficSource, type AnalyticsSource } from "@duel/domain/analytics";
import { sendAnalytics, setAnalyticsConsent } from "../lib/analytics-client";
type Preference = { enabled: boolean; consent: boolean; decided?: boolean; blocked?: boolean };
export function AnalyticsPreferences() {
  const pathname = usePathname();
  const [preference, setPreference] = useState<Preference | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const source = useRef<AnalyticsSource>("unknown");
  const sent = useRef("");
  const summary = useRef<HTMLElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    source.current = trafficSource(
      document.referrer,
      location.origin,
      params.get("utm_source") ??
        (["utm_medium", "gclid", "dclid", "msclkid"].some((key) => params.has(key))
          ? "campaign"
          : null),
    );
    let cancelled = false;
    void fetch("/api/analytics/preferences", {
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(5000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = (await response.json()) as Preference;
        if (!cancelled) {
          setPreference(value);
          setAnalyticsConsent(value.consent);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAnalyticsConsent(false);
          setError("Postavke nisu dostupne. Slanje iz pregledača je zaustavljeno.");
        }
      });
    return () => {
      cancelled = true;
      setAnalyticsConsent(false);
    };
  }, [retry]);
  useEffect(() => {
    if (!preference?.consent || !pathname || sent.current === pathname) return;
    sent.current = pathname;
    void sendAnalytics({
      name: "page_view",
      requestId: crypto.randomUUID(),
      page: pathname,
      source: source.current,
    });
    source.current = "unknown";
  }, [pathname, preference?.consent]);
  // Changes in other tabs stop collection immediately in this tab too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "duel.analytics.preference") {
        setAnalyticsConsent(false);
        setPreference(null);
        sent.current = "";
        setRetry((value) => value + 1);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  async function choose(consent: boolean) {
    setBusy(true);
    setError("");
    if (!consent) {
      setAnalyticsConsent(false);
      sent.current = "";
    }
    try {
      const response = await fetch("/api/analytics/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent }),
        credentials: "same-origin",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      const value = (await response.json()) as Preference;
      setPreference(value);
      setAnalyticsConsent(value.consent);
      requestAnimationFrame(() => summary.current?.focus());
      try {
        localStorage.setItem("duel.analytics.preference", String(Date.now()));
      } catch {
        /* Cookies remain authoritative. */
      }
    } catch {
      setError("Izmena nije potvrđena. Pokušaj ponovo; slanje analitike je zaustavljeno.");
      setAnalyticsConsent(false);
    } finally {
      setBusy(false);
    }
  }
  if (preference && !preference.enabled) return null;
  return (
    <section className="container analytics-preferences" aria-labelledby="analytics-title">
      <details open={!preference?.decided || !!error}>
        <summary ref={summary} id="analytics-title">
          Postavke analitike
        </summary>
        <p>
          Uz tvoju dozvolu beležimo posete i potvrđene radnje radi unapređenja aplikacije. Bez
          sadržaja odgovora, pozivnih linkova i spoljnog servisa. Sirovi podaci se čuvaju do 35
          dana, zbirni brojevi do 13 meseci. Izbor ne utiče na učenje i igru.
        </p>
        {preference && (
          <p role="status">
            {preference.consent ? "Analitika je dozvoljena." : "Analitika je isključena."}
            {preference.blocked ? " Poštujemo signal privatnosti pregledača." : ""}
          </p>
        )}
        <div className="analytics-actions">
          <button
            type="button"
            disabled={busy || !preference || preference.blocked}
            onClick={() => void choose(true)}
          >
            Dozvoli analitiku
          </button>
          <button type="button" disabled={busy || !preference} onClick={() => void choose(false)}>
            Bez analitike
          </button>
        </div>
        {error && (
          <p role="alert">
            {error}{" "}
            <button type="button" onClick={() => setRetry((value) => value + 1)}>
              Pokušaj ponovo
            </button>
          </p>
        )}
      </details>
    </section>
  );
}
