"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SyncResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  page?: number;
  limit?: number;
  titles?: string[];
  locations?: string[];
  triggered_by?: string;
  credits_consumed?: number;
  companies_touched?: number;
  candidates_upserted?: number;
  employments_upserted?: number;
  fallback_written?: boolean;
  fallback_file?: string;
  failed_at?: unknown;
  partial_progress?: Record<string, number>;
  details?: unknown;
  cause?: unknown;
};

type Preset = {
  name: string;
  titles: string;
  locations: string;
};

const presets: Preset[] = [
  {
    name: "Finland — Data leaders",
    titles: "Head of Data\nDirector of Data\nHead of AI",
    locations: "Finland",
  },
  {
    name: "Finland — Product leaders",
    titles: "Head of Product\nProduct Director\nChief Product Officer",
    locations: "Finland",
  },
  {
    name: "Helsinki — Engineering leaders",
    titles: "Head of Engineering\nEngineering Manager\nVP Engineering\nCTO",
    locations: "Helsinki, Finland",
  },
];

function parseList(value: string) {
  return value
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function StatCard(props: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {props.label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-stone-950">
        {props.value ?? "—"}
      </p>
    </div>
  );
}

function MetricGrid(props: {
  title: string;
  description?: string;
  metrics?: ApolloUsageMetric[];
}) {
  const metrics = props.metrics ?? [];

  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-sm font-semibold text-stone-950">{props.title}</h3>
        {props.description ? (
          <p className="mt-1 text-xs text-stone-500">{props.description}</p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {metrics.slice(0, 12).map((metric) => (
          <div
            key={metric.path}
            className="rounded-2xl border border-stone-200 bg-stone-50 p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              {metric.label}
            </p>
            <p className="mt-2 break-words text-xl font-semibold text-stone-950">
              {String(metric.value ?? "—")}
            </p>
            <p className="mt-1 break-all text-[11px] text-stone-400">
              {metric.path}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApolloUsagePanel(props: {
  usage: ApolloUsageResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="text-lg font-semibold">Apollo usage</h2>
          <p className="mt-1 text-sm text-stone-600">
            Shows API usage and rate-limit information from Apollo.
          </p>
        </div>

        <button
          className="rounded-xl border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50 disabled:opacity-60"
          onClick={props.onRefresh}
          disabled={props.isLoading}
          type="button"
        >
          {props.isLoading ? "Loading…" : "Refresh usage"}
        </button>
      </div>

      {!props.usage ? (
        <p className="text-sm text-stone-500">
          Click “Refresh usage” to load Apollo usage data.
        </p>
      ) : null}

      {props.usage?.error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">{props.usage.error}</p>
          {props.usage.message ? (
            <p className="mt-1">{props.usage.message}</p>
          ) : null}
          {props.usage.status === 403 ? (
            <p className="mt-2">
              Apollo requires a master API key for usage statistics.
            </p>
          ) : null}
        </div>
      ) : null}

      {props.usage?.ok ? (
        <div className="grid gap-6">
          <MetricGrid
            title="Credits / quota"
            description="Apollo credit, quota, remaining, and usage-related fields detected in the response."
            metrics={props.usage.credits}
          />

          {/* <MetricGrid
            title="Rate limits"
            description="Minute, hour, day, and endpoint rate-limit fields detected in the response."
            metrics={props.usage.rateLimits}
          /> */}
          {/* 
          <MetricGrid
            title="Other usage fields"
            metrics={props.usage.otherUsage}
          /> */}

          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Raw Apollo usage response
            </summary>
            <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-stone-950 p-4 text-xs text-stone-50">
              {JSON.stringify(props.usage.raw, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}

export function PeoplePullDashboard({ email }: { email: string }) {
  const router = useRouter();

  const [titles, setTitles] = useState(
    "Head of Data\nDirector of Data\nHead of AI",
  );
  const [locations, setLocations] = useState("Finland");
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);

  const titleList = useMemo(() => parseList(titles), [titles]);
  const locationList = useMemo(() => parseList(locations), [locations]);

  const [apolloUsage, setApolloUsage] = useState<ApolloUsageResponse | null>(
    null,
  );
  const [isLoadingApolloUsage, setIsLoadingApolloUsage] = useState(false);

  async function loadApolloUsage() {
    setIsLoadingApolloUsage(true);

    try {
      const response = await fetch("/api/apollo-usage", {
        method: "GET",
        cache: "no-store",
      });

      const json = (await response.json()) as ApolloUsageResponse;

      setApolloUsage({
        ...json,
        ok: response.ok && json.ok !== false,
      });
    } catch (error) {
      setApolloUsage({
        ok: false,
        error: "Failed to load Apollo usage.",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoadingApolloUsage(false);
    }
  }

  function applyPreset(preset: Preset) {
    setTitles(preset.titles);
    setLocations(preset.locations);
    setResult(null);
  }

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function runSync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    if (titleList.length === 0) {
      setResult({ error: "Add at least one title." });
      return;
    }

    if (locationList.length === 0) {
      setResult({ error: "Add at least one location." });
      return;
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 10);
    const safePage = Math.max(Number(page) || 1, 1);

    setIsRunning(true);

    try {
      const response = await fetch("/api/sync-apollo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          titles: titleList,
          locations: locationList,
          limit: safeLimit,
          page: safePage,
        }),
      });

      const json = (await response.json()) as SyncResponse;

      if (!response.ok) {
        setResult({
          ...json,
          error: json.error ?? `Request failed with ${response.status}`,
        });
        return;
      }

      setResult(json);
    } catch (error) {
      setResult({
        error: "Request failed",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsRunning(false);
    }
  }

  const [personName, setPersonName] = useState("");
  const [personLocation, setPersonLocation] = useState("Finland");
  const [isAddingPerson, setIsAddingPerson] = useState(false);

  async function addPersonByName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    const cleanName = personName.trim();
    const cleanLocation = personLocation.trim();

    if (!cleanName) {
      setResult({ error: "Add the person's name." });
      return;
    }

    if (!cleanLocation) {
      setResult({ error: "Add the person's location." });
      return;
    }

    setIsAddingPerson(true);

    try {
      const response = await fetch("/api/sync-apollo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personName: cleanName,
          locations: [cleanLocation],
          limit: 1,
          page: 1,
        }),
      });

      const json = (await response.json()) as SyncResponse;

      // const creditsUsed = Number(json.credits_consumed ?? 0);
      // setLatestCreditsConsumed(creditsUsed);

      // if (creditsUsed > 0) {
      //   setTotalCreditsConsumed((current) => current + creditsUsed);
      // }

      setResult(json);

      if (response.ok && json.ok) {
        window.dispatchEvent(new Event("hei-dingo:candidates-updated"));
      }
    } catch (error) {
      setResult({
        error: "Failed to add person.",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsAddingPerson(false);
    }
  }

  return (
    <div className="grid gap-6">
      <ApolloUsagePanel
        usage={apolloUsage}
        isLoading={isLoadingApolloUsage}
        onRefresh={loadApolloUsage}
      />
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <h2 className="text-lg font-semibold">Run Apollo sync</h2>
            <p className="mt-1 text-sm text-stone-600">
              Signed in as {email}. The dashboard server will call the protected
              API.
            </p>
          </div>

          <button
            className="rounded-xl border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50"
            onClick={signOut}
            type="button"
          >
            Sign out
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.name}
              className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
              onClick={() => applyPreset(preset)}
              type="button"
            >
              {preset.name}
            </button>
          ))}
        </div>

        <form className="grid gap-5" onSubmit={runSync}>
          <div className="grid gap-5 lg:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Titles</span>
              <textarea
                className="min-h-40 rounded-xl border border-stone-200 px-3 py-2 outline-none transition focus:border-stone-400"
                value={titles}
                onChange={(event) => setTitles(event.target.value)}
                placeholder="Head of Data, Director of AI"
              />
              <span className="text-xs text-stone-500">
                Comma-separated or one per line. Current count:{" "}
                {titleList.length}
              </span>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Locations</span>
              <textarea
                className="min-h-40 rounded-xl border border-stone-200 px-3 py-2 outline-none transition focus:border-stone-400"
                value={locations}
                onChange={(event) => setLocations(event.target.value)}
                placeholder="Finland, Helsinki, Finland"
              />
              <span className="text-xs text-stone-500">
                Comma-separated or one per line. Current count:{" "}
                {locationList.length}
              </span>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Limit</span>
              <input
                className="rounded-xl border border-stone-200 px-3 py-2 outline-none transition focus:border-stone-400"
                type="number"
                min={1}
                max={10}
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Page</span>
              <input
                className="rounded-xl border border-stone-200 px-3 py-2 outline-none transition focus:border-stone-400"
                type="number"
                min={1}
                value={page}
                onChange={(event) => setPage(Number(event.target.value))}
              />
            </label>
          </div>

          <button
            className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
            disabled={isRunning}
            type="submit"
          >
            {isRunning ? "Running sync…" : "Pull people into Supabase"}
          </button>
        </form>
      </section>

      {result ? (
        <section className="grid gap-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Result</h2>
              <p className="mt-1 text-sm text-stone-600">
                {result.ok
                  ? "Sync completed."
                  : "Sync failed or returned an error."}
              </p>
            </div>

            <span
              className={[
                "rounded-full px-3 py-1 text-xs font-medium",
                result.ok
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700",
              ].join(" ")}
            >
              {result.ok ? "Success" : "Error"}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="Companies" value={result.companies_touched} />
            <StatCard label="Candidates" value={result.candidates_upserted} />
            <StatCard label="Employments" value={result.employments_upserted} />
            <StatCard label="Credits" value={result.credits_consumed} />
          </div>

          {result.error || result.message ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">{result.error}</p>
              {result.message ? <p className="mt-1">{result.message}</p> : null}
            </div>
          ) : null}

          <pre className="max-h-[520px] overflow-auto rounded-2xl bg-stone-950 p-4 text-xs text-stone-50">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      ) : null}

      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Add one person by name</h2>
          <p className="mt-1 text-sm text-stone-600">
            Search Apollo by person name and location, enrich the best match,
            and add them to the candidates table.
          </p>
        </div>

        <form
          className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={addPersonByName}
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Person name</span>
            <input
              className="rounded-xl border border-stone-200 px-3 py-2 outline-none transition focus:border-stone-400"
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="Ada Lovelace"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Location</span>
            <input
              className="rounded-xl border border-stone-200 px-3 py-2 outline-none transition focus:border-stone-400"
              value={personLocation}
              onChange={(event) => setPersonLocation(event.target.value)}
              placeholder="Finland"
            />
          </label>

          <div className="flex items-end">
            <button
              className="w-full rounded-xl bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60 md:w-auto"
              disabled={isAddingPerson}
              type="submit"
            >
              {isAddingPerson ? "Adding…" : "Add person"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
