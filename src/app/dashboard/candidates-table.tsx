"use client";

import { useEffect, useMemo, useState } from "react";

type Company = {
  id: string;
  name: string | null;
  primary_domain: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  estimated_num_employees: number | null;
};

type Candidate = {
  id: string;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  headline: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  email: string | null;
  email_status: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  formatted_address: string | null;
  time_zone: string | null;
  seniority: string | null;
  departments: string[] | null;
  subdepartments: string[] | null;
  external_source: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  company: Company | null;
};

type CandidatesResponse = {
  items?: Candidate[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: string;
  message?: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 text-sm text-stone-600">
      {message}
    </div>
  );
}

export function CandidatesTable() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  const resultLabel = useMemo(() => {
    if (total === 0) return "No candidates";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `${start}–${end} of ${total}`;
  }, [page, pageSize, total]);

  async function loadCandidates(nextPage = page) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
      });

      if (query.trim()) {
        params.set("q", query.trim());
      }

      const response = await fetch(`/api/candidates?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = (await response.json()) as CandidatesResponse;

      if (!response.ok) {
        setErrorMessage(
          json.message ?? json.error ?? "Failed to load candidates.",
        );
        return;
      }

      setItems(json.items ?? []);
      setPage(json.pagination?.page ?? nextPage);
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load candidates.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCandidates(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, query]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(draftQuery);
  }

  useEffect(() => {
    function refreshCandidates() {
      void loadCandidates(1);
      setPage(1);
    }

    window.addEventListener("hei-dingo:candidates-updated", refreshCandidates);

    return () => {
      window.removeEventListener(
        "hei-dingo:candidates-updated",
        refreshCandidates,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, query]);

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-lg font-semibold">Candidates</h2>
          <p className="mt-1 text-sm text-stone-600">
            All candidates currently stored in the Supabase candidates table.
          </p>
        </div>

        <form className="flex w-full gap-2 lg:w-auto" onSubmit={submitSearch}>
          <input
            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none transition focus:border-stone-400 lg:w-80"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search name, title, email, city…"
          />

          <button
            className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
            type="submit"
          >
            Search
          </button>

          {query ? (
            <button
              className="rounded-xl border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50"
              type="button"
              onClick={() => {
                setDraftQuery("");
                setQuery("");
                setPage(1);
              }}
            >
              Clear
            </button>
          ) : null}
        </form>
      </div>

      <div className="mb-4 flex flex-col justify-between gap-3 text-sm text-stone-600 md:flex-row md:items-center">
        <p>{resultLabel}</p>

        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      {items.length === 0 && !isLoading ? (
        <EmptyState message="No candidates found." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Candidate</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {items.map((candidate) => (
                  <tr
                    key={candidate.id}
                    className="align-top hover:bg-stone-50/70"
                  >
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        {candidate.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={candidate.photo_url}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-500">
                            {(
                              candidate.full_name ??
                              candidate.first_name ??
                              "?"
                            )
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="font-medium text-stone-950">
                            {candidate.full_name ??
                              [candidate.first_name, candidate.last_name]
                                .filter(Boolean)
                                .join(" ") ??
                              "Unnamed"}
                          </p>

                          {candidate.linkedin_url ? (
                            <a
                              className="mt-1 block truncate text-xs text-blue-700 hover:underline"
                              href={candidate.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              LinkedIn
                            </a>
                          ) : (
                            <p className="mt-1 text-xs text-stone-400">
                              No LinkedIn
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="max-w-xs font-medium text-stone-900">
                        {candidate.title ?? "—"}
                      </p>
                      {candidate.seniority ? (
                        <p className="mt-1 text-xs text-stone-500">
                          {candidate.seniority}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      <p className="max-w-xs font-medium text-stone-900">
                        {candidate.company?.name ?? "—"}
                      </p>
                      {candidate.company?.primary_domain ? (
                        <p className="mt-1 text-xs text-stone-500">
                          {candidate.company.primary_domain}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      <p>
                        {candidate.formatted_address ?? candidate.city ?? "—"}
                      </p>
                      {candidate.country ? (
                        <p className="mt-1 text-xs text-stone-500">
                          {candidate.country}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      <p>{candidate.email ?? "—"}</p>
                      {candidate.email_status ? (
                        <span className="mt-1 inline-flex rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-600">
                          {candidate.email_status}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      <p>{candidate.external_source ?? "—"}</p>
                      {candidate.external_id ? (
                        <p className="mt-1 max-w-[160px] truncate text-xs text-stone-500">
                          {candidate.external_id}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 text-stone-500">
                      {formatDate(candidate.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isLoading ? (
            <div className="border-t border-stone-200 bg-white p-4 text-sm text-stone-500">
              Loading candidates…
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <p className="text-sm text-stone-500">
          Page {page} of {totalPages}
        </p>

        <div className="flex gap-2">
          <button
            className="rounded-xl border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canGoPrevious || isLoading}
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            type="button"
          >
            Previous
          </button>

          <button
            className="rounded-xl border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canGoNext || isLoading}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
