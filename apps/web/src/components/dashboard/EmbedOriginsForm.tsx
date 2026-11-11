"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, CardHeader, Field, cardClass, inputClass } from "@/components/ui";
import { api, errorText } from "@/lib/api";

type Response = { origins: string[] };

/** The sites allowed to open this merchant's checkout in an embedded modal. */
export function EmbedOriginsForm() {
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Response>("/api/dashboard/embed-origins")
      .then(({ origins }) => setValue(origins.join("\n")))
      .catch((err) => setError(errorText(err, "Could not load the allowed sites")))
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const origins = value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const result = await api<Response>("/api/dashboard/embed-origins", { method: "PUT", body: { origins } });
      setValue(result.origins.join("\n"));
      setSaved(true);
    } catch (err) {
      setError(errorText(err, "Could not save the allowed sites"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} aria-labelledby="embed-title" className={`${cardClass} space-y-5 p-6`}>
      <CardHeader
        id="embed-title"
        title="Embedded checkout sites"
        description={
          <>
            Only these sites may open your checkout inside a modal on their own pages, with <code className="font-mono text-xs">mezout.js</code> or the React
            component. Payment links work everywhere regardless.{" "}
            <Link href="/docs#embedded-checkout" className="font-medium text-stone-900 underline underline-offset-2">
              Embedding guide
            </Link>
          </>
        }
      />
      <Field label="Allowed sites" hint="One origin per line, including https:// and no path.">
        {(ids) => (
          <textarea
            {...ids}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            disabled={!loaded || busy}
            rows={4}
            spellCheck={false}
            placeholder={"https://shop.example.com\nhttp://localhost:3000"}
            className={`${inputClass} font-mono`}
          />
        )}
      </Field>
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <p role="status" className="text-sm text-green-800">
            Saved.
          </p>
        )}
        <Button type="submit" disabled={!loaded} loading={busy}>
          {busy ? "Saving…" : "Save sites"}
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  );
}
