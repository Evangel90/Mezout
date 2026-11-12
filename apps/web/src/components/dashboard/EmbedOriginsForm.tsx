"use client";

import { useEffect, useState } from "react";
import { Alert, Button, CardHeader, ExternalLink, Field, Skeleton, cardClass, inputClass, useToast } from "@/components/ui";
import { api, errorText } from "@/lib/api";

type Response = { origins: string[] };

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const MAX_SITES = 10;
const LOCAL = ["localhost", "127.0.0.1", "[::1]"];

/**
 * A hint for the first line the server would refuse (the same rules as normalizeEmbedOrigins), or null. The server
 * still decides; this only explains the problem before saving.
 */
function originProblem(value: string) {
  const all = lines(value);
  if (all.length > MAX_SITES) return `Add up to ${MAX_SITES} sites`;
  for (const line of all) {
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      return `“${line}” isn’t a web address. Start it with https://`;
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return `Use just the site, without a path: ${url.origin}`;
    if (url.protocol !== "https:" && !(LOCAL.includes(url.hostname) && url.protocol === "http:")) {
      return `“${line}” must use https:// (http:// works only for localhost)`;
    }
  }
  return null;
}

/** The sites allowed to open this merchant's checkout in an embedded modal. */
export function EmbedOriginsForm() {
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    api<Response>("/api/dashboard/embed-origins")
      .then(({ origins }) => setValue(origins.join("\n")))
      .catch((err) => setError(errorText(err, "Could not load the allowed sites")))
      .finally(() => setLoaded(true));
  }, []);

  const problem = touched ? originProblem(value) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (originProblem(value)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<Response>("/api/dashboard/embed-origins", { method: "PUT", body: { origins: lines(value) } });
      setValue(result.origins.join("\n"));
      toast(result.origins.length ? "Allowed sites saved" : "No sites allowed. Embedding is off.");
    } catch (err) {
      setError(errorText(err, "Could not save the allowed sites"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate aria-labelledby="embed-title" className={`${cardClass} space-y-5 p-6`}>
      <CardHeader
        id="embed-title"
        title="Embedded checkout sites"
        description={
          <>
            Sites allowed to open your checkout in a pop-up on their own pages. Payment links work everywhere, whatever
            you put here.{" "}
            <ExternalLink href="/guides/embedded-checkout" className="font-medium text-stone-900 underline underline-offset-2">
              Embedding guide
            </ExternalLink>
          </>
        }
      />
      <Field label="Allowed sites" hint="One per line, like https://shop.example.com. No path." error={problem}>
        {(ids) =>
          loaded ? (
            <textarea
              {...ids}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onBlur={() => setTouched(true)}
              disabled={busy}
              rows={4}
              spellCheck={false}
              autoCapitalize="off"
              placeholder={"https://shop.example.com\nhttp://localhost:3000"}
              className={`${inputClass} font-mono`}
            />
          ) : (
            <Skeleton className="h-[7.5rem] w-full" />
          )
        }
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={!loaded} loading={busy} className="w-full sm:w-auto">
          {busy ? "Saving…" : "Save sites"}
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  );
}
