"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { claimSchema } from "@pathey/types";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Download, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button, Field } from "@pathey/ui";
import { apiUrl, formatIndia } from "@/lib/api";

const formSchema = claimSchema.omit({ cycleSlug: true });
type Form = z.infer<typeof formSchema>;
type PublicCycle = {
  slug: string;
  title: string;
  resultNumber: string;
  publicationAt: string;
  expiresAt: string;
};

async function publicFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const json = await response
    .json()
    .catch(() => ({ error: { message: "Network response could not be read." } }));
  if (!response.ok) {
    const error = new Error(json.error?.message ?? "Request failed") as Error & {
      messageHi?: string;
      code?: string;
    };
    error.messageHi = json.error?.messageHi;
    error.code = json.error?.code;
    throw error;
  }
  return json;
}

function PortalMessage({
  title,
  message,
  messageHi,
}: {
  title: string;
  message: string;
  messageHi?: string;
}) {
  return (
    <main className="public-page">
      <div className="claim-shell">
        <header className="claim-head">
          <h1>पाथेय कण · Certificate Portal</h1>
        </header>
        <div className="claim-form">
          <h2>{title}</h2>
          <p className="notice notice-danger">{message}</p>
          {messageHi && <p lang="hi">{messageHi}</p>}
        </div>
      </div>
    </main>
  );
}

export function ClaimPortal({ slug: fixedSlug }: { slug?: string }) {
  const [chosenSlug, setChosenSlug] = useState("");
  const [csrf, setCsrf] = useState("");
  const [session, setSession] = useState<any>(null);
  const [messageHi, setMessageHi] = useState("");
  const [downloading, setDownloading] = useState(false);

  const activeCycles = useQuery({
    queryKey: ["public-cycles"],
    queryFn: () => publicFetch("/public/cycles"),
    enabled: !fixedSlug,
    retry: 1,
  });
  const available: PublicCycle[] = activeCycles.data?.data ?? [];
  const selectedSlug = fixedSlug ?? (chosenSlug || available[0]?.slug || "");
  const cycle = useQuery({
    queryKey: ["public-cycle", selectedSlug],
    queryFn: () => publicFetch(`/public/cycles/${selectedSlug}`),
    enabled: Boolean(selectedSlug),
    retry: false,
  });
  const form = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: { phone: "" },
  });

  const chooseCycle = (nextSlug: string) => {
    setChosenSlug(nextSlug);
    setSession(null);
    setCsrf("");
    setMessageHi("");
    form.reset();
  };

  const submit = async (values: Form) => {
    setMessageHi("");
    try {
      const verified = await publicFetch("/public/claims/verify", {
        method: "POST",
        body: JSON.stringify({ ...values, cycleSlug: selectedSlug }),
      });
      setCsrf(verified.data.csrf);
      const active = await publicFetch("/public/claims/session");
      setSession(active.data);
    } catch (caught) {
      const error = caught as Error & { messageHi?: string };
      form.setError("root", { message: error.message });
      setMessageHi(
        error.messageHi ??
          "दर्ज की गई जानकारी सही नहीं है। कृपया पुनः प्रयास करें।",
      );
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(apiUrl("/public/certificates/download"), {
        method: "POST",
        credentials: "include",
        headers: { "x-claim-csrf": csrf },
      });
      if (!response.ok)
        throw new Error((await response.json()).error?.message ?? "Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "certificate.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      form.setError("root", { message: (caught as Error).message });
    } finally {
      setDownloading(false);
    }
  };

  if (!fixedSlug && activeCycles.isPending)
    return (
      <PortalMessage
        title="Loading current results…"
        message="Preparing the secure certificate form."
      />
    );
  if (!fixedSlug && activeCycles.error)
    return (
      <PortalMessage
        title="Certificate service unavailable"
        message={activeCycles.error.message}
        messageHi="प्रमाण पत्र सेवा अभी उपलब्ध नहीं है।"
      />
    );
  if (!fixedSlug && available.length === 0)
    return (
      <PortalMessage
        title="No certificate window is currently open"
        message="Please return after the next result is published or use the QR link supplied with an earlier eligible result."
        messageHi="अभी कोई प्रमाण पत्र डाउनलोड अवधि उपलब्ध नहीं है।"
      />
    );
  if (cycle.isPending)
    return (
      <PortalMessage
        title="Loading secure certificate portal…"
        message="Checking the result availability."
      />
    );
  if (cycle.error || !cycle.data?.data)
    return (
      <PortalMessage
        title="Certificate link unavailable"
        message={
          cycle.error?.message ?? "The certificate service is temporarily unavailable."
        }
        messageHi="प्रमाण पत्र लिंक उपलब्ध नहीं है।"
      />
    );

  const current = cycle.data.data;
  if (current.state !== "open")
    return (
      <PortalMessage
        title={
          current.state === "expired" || current.state === "purged"
            ? "Download period ended"
            : "Certificates not available yet"
        }
        message={current.message?.en ?? "The certificate window is not open."}
        messageHi={
          current.message?.hi ?? "प्रमाण पत्र की अवधि अभी शुरू नहीं हुई है।"
        }
      />
    );

  return (
    <main className="public-page">
      <div className="claim-shell">
        <header className="claim-head">
          <ShieldCheck size={30} aria-hidden />
          <div>
            <h1>पाथेय कण · प्रमाण पत्र</h1>
            <span>Secure Certificate Portal · No account login required</span>
          </div>
        </header>
        <div className="claim-context">
          {!fixedSlug && available.length > 1 && (
            <label className="field public-cycle-picker">
              <span>Result / परिणाम चुनें</span>
              <select
                value={selectedSlug}
                onChange={(event) => chooseCycle(event.target.value)}
              >
                {available.map((item) => (
                  <option value={item.slug} key={item.slug}>
                    {item.title} · Result {item.resultNumber}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p>
            <strong>{current.title}</strong> · Result {current.resultNumber}
            {" · "}Download by <strong>{formatIndia(current.expiresAt)}</strong>
          </p>
        </div>
        <section className="claim-form">
          {session ? (
            <>
              <h2>Your personalised certificate is ready</h2>
              <p>
                <strong>{session.candidate.nameHindi}</strong> ·{" "}
                {session.candidate.nameEnglish}
              </p>
              <iframe
                className="pdf-frame"
                title="Certificate preview"
                src={apiUrl("/public/certificates/preview")}
              />
              <Button
                style={{ width: "100%", marginTop: 16 }}
                onClick={download}
                disabled={downloading}
              >
                <Download size={18} />
                {downloading ? "Preparing PDF…" : "Download certificate PDF"}
              </Button>
              <p className="session-deadline">
                You may download again until {formatIndia(session.cycle.expiresAt)}.
              </p>
            </>
          ) : (
            <>
              <h2>Enter your mobile number to download your certificate</h2>
              <p className="form-intro">
                No account needed. Use the 10-digit mobile number registered
                with the publication office.
              </p>
              <form onSubmit={form.handleSubmit(submit)} noValidate className="phone-hero">
                <Field
                  label="Mobile number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  autoFocus
                  {...form.register("phone")}
                  error={form.formState.errors.phone?.message}
                />
                {form.formState.errors.root && (
                  <div className="notice notice-danger" role="alert">
                    <strong>{form.formState.errors.root.message}</strong>
                    {messageHi && (
                      <>
                        <br />
                        <span lang="hi">{messageHi}</span>
                      </>
                    )}
                  </div>
                )}
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? "Generating secure preview…"
                    : "Generate my certificate"}
                </Button>
              </form>
              <p className="secure-note">
                <LockKeyhole size={16} aria-hidden /> Your mobile number is
                checked securely and never shown publicly. It's the same
                number provided during registration — not the one printed in
                the magazine.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
