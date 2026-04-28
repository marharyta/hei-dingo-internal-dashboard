import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APOLLO_API_KEY = process.env.APOLLO_API_KEY?.trim();
const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const APOLLO_INFO_DIR = path.resolve(process.cwd(), "apollo_info");
const DEFAULT_LOCATIONS = ["Finland"];

type PeopleSearchPerson = {
  id?: string;
};

type PeopleSearchResponse = {
  people?: PeopleSearchPerson[];
  [key: string]: unknown;
};

type ApolloOrganization = {
  name?: string;
  primary_domain?: string;
  website_url?: string;
  linkedin_url?: string;
  industry?: string;
  estimated_num_employees?: number | string | null;
  [key: string]: unknown;
};

type ApolloEmployment = {
  id?: string;
  _id?: string;
  key?: string;
  organization_name?: string;
  title?: string;
  start_date?: string;
  end_date?: string;
  current?: boolean | string;
  [key: string]: unknown;
};

type BulkMatchPerson = {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  linkedin_url?: string;
  title?: string;
  photo_url?: string;
  headline?: string;
  email?: string;
  email_status?: string;
  city?: string;
  state?: string;
  country?: string;
  formatted_address?: string;
  time_zone?: string;
  seniority?: string;
  departments?: string[];
  subdepartments?: string[];
  employment_history?: ApolloEmployment[];
  organization?: ApolloOrganization;
  [key: string]: unknown;
};

type BulkMatchResponse = {
  status?: string;
  credits_consumed?: number;
  matches?: BulkMatchPerson[];
  [key: string]: unknown;
};

type SyncCounters = {
  companiesTouched: number;
  candidatesUpserted: number;
  employmentsUpserted: number;
};

type FailureContext = {
  stage: string;
  person_id?: string;
  person_name?: string | null;
  employment_external_id?: string | null;
  employment_org_name?: string | null;
};

function normalizeStringArray(input: unknown): string[] {
  if (input == null) return [];

  if (Array.isArray(input)) {
    return input
      .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (typeof input === "string") {
    return input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
}

function toStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function safeHostFromUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function unwrapError(error: unknown): Error {
  if (error instanceof Error) return error;

  if (typeof error === "object" && error) {
    const message =
      (error as { message?: unknown }).message ??
      (error as { error_description?: unknown }).error_description ??
      JSON.stringify(error);

    return new Error(String(message));
  }

  return new Error(String(error));
}

function serializeError(error: unknown) {
  const normalized = unwrapError(error);
  const raw = error as {
    name?: string;
    stack?: string;
    cause?: { message?: string; code?: string } | unknown;
  };

  return {
    name: raw?.name ?? normalized.name,
    message: normalized.message,
    cause:
      typeof raw?.cause === "object" && raw.cause
        ? ((raw.cause as { message?: string; code?: string }).message ??
          (raw.cause as { message?: string; code?: string }).code ??
          String(raw.cause))
        : raw?.cause
          ? String(raw.cause)
          : null,
    stack: raw?.stack ?? normalized.stack ?? null,
  };
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createSupabaseServiceClient() {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not set.");
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function writeApolloFallbackSeed(input: {
  page: number;
  limit: number;
  titles: string[];
  locations: string[];
  personName: string | null;
  requestUrl: string;
  searchData: PeopleSearchResponse;
  enrichData: BulkMatchResponse;
  matches: BulkMatchPerson[];
  counters: SyncCounters;
  failureContext: FailureContext;
  error: unknown;
}) {
  await mkdir(APOLLO_INFO_DIR, { recursive: true });

  const filename = `apollo_seed_${timestampForFilename()}_page-${input.page}.json`;
  const filepath = path.join(APOLLO_INFO_DIR, filename);

  const payload = {
    created_at: new Date().toISOString(),
    request: {
      page: input.page,
      limit: input.limit,
      titles: input.titles,
      locations: input.locations,
      person_name: input.personName,
      url: input.requestUrl,
    },
    apollo: {
      search: input.searchData,
      enrich: input.enrichData,
      matches: input.matches,
    },
    sync: {
      ok: false,
      counters: {
        companies_touched: input.counters.companiesTouched,
        candidates_upserted: input.counters.candidatesUpserted,
        employments_upserted: input.counters.employmentsUpserted,
      },
      failed_at: input.failureContext,
      error: serializeError(input.error),
    },
  };

  await writeFile(filepath, JSON.stringify(payload, null, 2), "utf8");

  return filepath;
}

async function ensureCompany(
  client: SupabaseClient,
  organization: ApolloOrganization | undefined,
  cache: Map<string, string>,
): Promise<string | null> {
  if (!organization) return null;

  const name = toStr(organization.name);
  const primaryDomain =
    toStr(organization.primary_domain) ??
    safeHostFromUrl(toStr(organization.website_url)) ??
    safeHostFromUrl(toStr(organization.linkedin_url));

  const key = (primaryDomain ?? name)?.toLowerCase();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached) return cached;

  const employeeCount =
    organization.estimated_num_employees != null
      ? Number(organization.estimated_num_employees)
      : null;

  if (primaryDomain) {
    const { data, error } = await client
      .from("companies")
      .upsert(
        {
          name,
          primary_domain: primaryDomain,
          website_url: toStr(organization.website_url),
          linkedin_url: toStr(organization.linkedin_url),
          industry: toStr(organization.industry),
          estimated_num_employees: Number.isFinite(employeeCount)
            ? employeeCount
            : null,
          raw: organization,
        },
        { onConflict: "primary_domain" },
      )
      .select("id")
      .single();

    if (error) throw unwrapError(error);

    cache.set(key, data.id);
    return data.id;
  }

  if (!name) return null;

  const existing = await client
    .from("companies")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (existing.error) throw unwrapError(existing.error);

  if (existing.data?.id) {
    cache.set(key, existing.data.id);
    return existing.data.id;
  }

  const inserted = await client
    .from("companies")
    .insert({
      name,
      primary_domain: null,
      website_url: toStr(organization.website_url),
      linkedin_url: toStr(organization.linkedin_url),
      industry: toStr(organization.industry),
      estimated_num_employees: Number.isFinite(employeeCount)
        ? employeeCount
        : null,
      raw: organization,
    })
    .select("id")
    .single();

  if (inserted.error) throw unwrapError(inserted.error);

  cache.set(key, inserted.data.id);
  return inserted.data.id;
}

async function upsertCandidate(
  client: SupabaseClient,
  person: BulkMatchPerson,
  companyId: string | null,
): Promise<{ id: string; external_id: string }> {
  const externalId = String(person.id);

  const { data, error } = await client
    .from("candidates")
    .upsert(
      {
        company_id: companyId,
        first_name: toStr(person.first_name),
        last_name: toStr(person.last_name),
        full_name: toStr(person.name),
        title: toStr(person.title),
        headline: toStr(person.headline),
        linkedin_url: toStr(person.linkedin_url),
        photo_url: toStr(person.photo_url),
        email: toStr(person.email),
        email_status: toStr(person.email_status),
        city: toStr(person.city),
        state: toStr(person.state),
        country: toStr(person.country),
        formatted_address: toStr(person.formatted_address),
        time_zone: toStr(person.time_zone),
        seniority: toStr(person.seniority),
        departments: Array.isArray(person.departments)
          ? person.departments
          : [],
        subdepartments: Array.isArray(person.subdepartments)
          ? person.subdepartments
          : [],
        external_source: "apollo",
        external_id: externalId,
        raw: person,
      },
      { onConflict: "external_source,external_id" },
    )
    .select("id, external_id")
    .single();

  if (error) throw unwrapError(error);

  return {
    id: data.id,
    external_id: data.external_id,
  };
}

async function upsertEmployment(
  client: SupabaseClient,
  candidateId: string,
  employment: ApolloEmployment,
  companyId: string | null,
): Promise<void> {
  const externalId =
    toStr(employment.id) ?? toStr(employment._id) ?? toStr(employment.key);

  if (!externalId) return;

  const { error } = await client.from("candidate_employments").upsert(
    {
      candidate_id: candidateId,
      company_id: companyId,
      company_name: toStr(employment.organization_name),
      title: toStr(employment.title),
      start_date: toStr(employment.start_date),
      end_date: toStr(employment.end_date),
      current: employment.current === true || employment.current === "true",
      external_id: externalId,
      raw: employment,
    },
    { onConflict: "candidate_id,external_id" },
  );

  if (error) throw unwrapError(error);
}

async function requireDashboardSession() {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function POST(request: Request) {
  const session = await requireDashboardSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!APOLLO_API_KEY) {
      return NextResponse.json(
        { error: "APOLLO_API_KEY is not set." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      titles?: unknown;
      locations?: unknown;
      limit?: unknown;
      page?: unknown;
      personName?: unknown;
    };

    const personName = toStr(body.personName);
    const isSinglePersonLookup = Boolean(personName);

    const page = Math.max(1, Number(body.page ?? 1));
    const limit = isSinglePersonLookup
      ? Math.min(Math.max(Number(body.limit ?? 1), 1), 5)
      : Math.min(Math.max(Number(body.limit ?? 10), 1), 10);

    const requestedTitles = normalizeStringArray(body.titles);
    const requestedLocations = normalizeStringArray(body.locations);

    const titles = isSinglePersonLookup
      ? []
      : requestedTitles.length > 0
        ? [...new Set(requestedTitles)]
        : [];

    const locations =
      requestedLocations.length > 0
        ? [...new Set(requestedLocations)]
        : DEFAULT_LOCATIONS;

    if (!isSinglePersonLookup && titles.length === 0) {
      return NextResponse.json(
        { error: "At least one title must be provided." },
        { status: 400 },
      );
    }

    if (locations.length === 0) {
      return NextResponse.json(
        { error: "At least one location must be provided." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceClient();

    const searchUrl = new URL(
      "https://api.apollo.io/api/v1/mixed_people/api_search",
    );

    for (const location of locations) {
      searchUrl.searchParams.append("person_locations[]", location);
    }

    if (personName) {
      searchUrl.searchParams.set("q_keywords", personName);
    } else {
      for (const title of titles) {
        searchUrl.searchParams.append("person_titles[]", title);
      }
    }

    searchUrl.searchParams.set("per_page", String(limit));
    searchUrl.searchParams.set("page", String(page));

    const searchResp = await fetch(searchUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      cache: "no-store",
    });

    if (!searchResp.ok) {
      const details = await searchResp.text();

      return NextResponse.json(
        {
          error: "Apollo search failed.",
          details,
          mode: isSinglePersonLookup
            ? "single_person_lookup"
            : "bulk_title_location_sync",
          person_name: personName,
          page,
          limit,
          titles,
          locations,
          triggered_by: session.email,
        },
        { status: searchResp.status },
      );
    }

    const searchData = (await searchResp.json()) as PeopleSearchResponse;

    const ids = (searchData.people ?? [])
      .map((person) => person.id)
      .filter((value): value is string => Boolean(value));

    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No people returned by search.",
        mode: isSinglePersonLookup
          ? "single_person_lookup"
          : "bulk_title_location_sync",
        person_name: personName,
        page,
        limit,
        titles,
        locations,
        triggered_by: session.email,
        credits_consumed: 0,
      });
    }

    const enrichUrl = new URL("https://api.apollo.io/api/v1/people/bulk_match");
    enrichUrl.searchParams.set("reveal_personal_emails", "false");
    enrichUrl.searchParams.set("reveal_phone_number", "false");

    const enrichResp = await fetch(enrichUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      body: JSON.stringify({
        details: ids.slice(0, 10).map((id) => ({ id })),
      }),
      cache: "no-store",
    });

    const enrichText = await enrichResp.text();

    let enrichData: BulkMatchResponse;

    try {
      enrichData = JSON.parse(enrichText) as BulkMatchResponse;
    } catch {
      return NextResponse.json(
        {
          error: "Failed to parse Apollo enrichment JSON.",
          raw: enrichText,
          mode: isSinglePersonLookup
            ? "single_person_lookup"
            : "bulk_title_location_sync",
          person_name: personName,
          page,
          limit,
          titles,
          locations,
          triggered_by: session.email,
        },
        { status: 500 },
      );
    }

    if (!enrichResp.ok) {
      return NextResponse.json(
        {
          error: "Apollo enrichment failed.",
          response: enrichData,
          mode: isSinglePersonLookup
            ? "single_person_lookup"
            : "bulk_title_location_sync",
          person_name: personName,
          page,
          limit,
          titles,
          locations,
          triggered_by: session.email,
        },
        { status: enrichResp.status },
      );
    }

    const matches = enrichData.matches ?? [];

    if (matches.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Enrichment returned no matches.",
        mode: isSinglePersonLookup
          ? "single_person_lookup"
          : "bulk_title_location_sync",
        person_name: personName,
        page,
        limit,
        titles,
        locations,
        triggered_by: session.email,
        credits_consumed: Number(enrichData.credits_consumed ?? 0),
      });
    }

    const companyCache = new Map<string, string>();

    const counters: SyncCounters = {
      companiesTouched: 0,
      candidatesUpserted: 0,
      employmentsUpserted: 0,
    };

    let failureContext: FailureContext = {
      stage: "not_started",
    };

    try {
      for (const person of matches) {
        failureContext = {
          stage: "ensure_company_from_person.organization",
          person_id: person.id,
          person_name: toStr(person.name),
        };

        const companyId = await ensureCompany(
          supabase,
          person.organization,
          companyCache,
        );

        if (companyId) counters.companiesTouched++;

        failureContext = {
          stage: "upsert_candidate",
          person_id: person.id,
          person_name: toStr(person.name),
        };

        const candidate = await upsertCandidate(supabase, person, companyId);
        counters.candidatesUpserted++;

        const history = Array.isArray(person.employment_history)
          ? person.employment_history
          : [];

        for (const employment of history) {
          const employmentExternalId =
            toStr(employment.id) ??
            toStr(employment._id) ??
            toStr(employment.key);

          const employmentOrgName = toStr(employment.organization_name);

          failureContext = {
            stage: "upsert_employment",
            person_id: person.id,
            person_name: toStr(person.name),
            employment_external_id: employmentExternalId,
            employment_org_name: employmentOrgName,
          };

          await upsertEmployment(supabase, candidate.id, employment, null);
          counters.employmentsUpserted++;
        }
      }
    } catch (syncError) {
      try {
        const seedFilePath = await writeApolloFallbackSeed({
          page,
          limit,
          titles,
          locations,
          personName,
          requestUrl: "/api/sync-apollo",
          searchData,
          enrichData,
          matches,
          counters,
          failureContext,
          error: syncError,
        });

        return NextResponse.json(
          {
            ok: false,
            error: "Supabase sync failed.",
            message: unwrapError(syncError).message,
            fallback_written: true,
            fallback_file: seedFilePath,
            failed_at: failureContext,
            partial_progress: {
              companies_touched: counters.companiesTouched,
              candidates_upserted: counters.candidatesUpserted,
              employments_upserted: counters.employmentsUpserted,
            },
            credits_consumed: Number(enrichData.credits_consumed ?? 0),
            mode: isSinglePersonLookup
              ? "single_person_lookup"
              : "bulk_title_location_sync",
            person_name: personName,
            page,
            limit,
            titles,
            locations,
            triggered_by: session.email,
          },
          { status: 500 },
        );
      } catch (seedWriteError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Supabase sync failed and fallback seed write also failed.",
            message: unwrapError(syncError).message,
            failed_at: failureContext,
            fallback_written: false,
            fallback_error: serializeError(seedWriteError),
            partial_progress: {
              companies_touched: counters.companiesTouched,
              candidates_upserted: counters.candidatesUpserted,
              employments_upserted: counters.employmentsUpserted,
            },
            credits_consumed: Number(enrichData.credits_consumed ?? 0),
            mode: isSinglePersonLookup
              ? "single_person_lookup"
              : "bulk_title_location_sync",
            person_name: personName,
            page,
            limit,
            titles,
            locations,
            triggered_by: session.email,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      mode: isSinglePersonLookup
        ? "single_person_lookup"
        : "bulk_title_location_sync",
      person_name: personName,
      page,
      limit,
      titles,
      locations,
      triggered_by: session.email,
      credits_consumed: Number(enrichData.credits_consumed ?? 0),
      companies_touched: counters.companiesTouched,
      candidates_upserted: counters.candidatesUpserted,
      employments_upserted: counters.employmentsUpserted,
    });
  } catch (error) {
    const normalized = unwrapError(error);

    return NextResponse.json(
      {
        error: "Unexpected error.",
        message: normalized.message,
        cause:
          typeof (error as { cause?: unknown })?.cause === "object"
            ? JSON.stringify((error as { cause?: unknown }).cause)
            : ((error as { cause?: unknown })?.cause ?? null),
      },
      { status: 500 },
    );
  }
}
