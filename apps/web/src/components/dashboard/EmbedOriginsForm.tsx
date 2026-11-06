"use client";

import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";

type Response = { origins: string[] };

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
    <form onSubmit={save} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Embedded checkout sites</h2>
        <p className="text-sm text-stone-600">
          Only these sites may open your checkout inside a modal. Add one origin per line, including https:// and no path.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setSaved(false);
        }}
        disabled={!loaded || busy}
        rows={4}
        placeholder={"https://shop.example.com\nhttp://localhost:3000"}
        aria-label="Allowed embedded checkout sites"
        className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm disabled:bg-stone-50"
      />
      <div className="flex items-center gap-3">
        <button disabled={!loaded || busy} className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50">
          {busy ? "Saving…" : "Save sites"}
        </button>
        {saved && <p className="text-sm text-green-800">Saved.</p>}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
