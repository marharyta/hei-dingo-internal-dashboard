import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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

function clampPageSize(value: number) {
  if (!Number.isFinite(value)) return 25;
  return Math.min(Math.max(value, 5), 100);
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
  const pageSize = clampPageSize(
    Number(url.searchParams.get("pageSize") ?? 25),
  );
  const query = url.searchParams.get("q")?.trim() ?? "";

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = createSupabaseServiceClient();

  let candidatesQuery = supabase
    .from("candidates")
    .select(
      `
        id,
        company_id,
        first_name,
        last_name,
        full_name,
        title,
        headline,
        linkedin_url,
        photo_url,
        email,
        email_status,
        city,
        state,
        country,
        formatted_address,
        time_zone,
        seniority,
        departments,
        subdepartments,
        external_source,
        external_id,
        created_at,
        updated_at
      `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (query) {
    candidatesQuery = candidatesQuery.or(
      [
        `full_name.ilike.%${query}%`,
        `first_name.ilike.%${query}%`,
        `last_name.ilike.%${query}%`,
        `title.ilike.%${query}%`,
        `email.ilike.%${query}%`,
        `linkedin_url.ilike.%${query}%`,
        `country.ilike.%${query}%`,
        `city.ilike.%${query}%`,
      ].join(","),
    );
  }

  const { data: candidates, error, count } = await candidatesQuery;

  if (error) {
    return NextResponse.json(
      {
        error: "Failed to load candidates.",
        message: error.message,
      },
      { status: 500 },
    );
  }

  const companyIds = [
    ...new Set(
      (candidates ?? [])
        .map((candidate) => candidate.company_id)
        .filter(Boolean),
    ),
  ];

  let companiesById = new Map<string, unknown>();

  if (companyIds.length > 0) {
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select(
        `
          id,
          name,
          primary_domain,
          website_url,
          linkedin_url,
          industry,
          estimated_num_employees
        `,
      )
      .in("id", companyIds);

    if (companiesError) {
      return NextResponse.json(
        {
          error: "Failed to load companies.",
          message: companiesError.message,
        },
        { status: 500 },
      );
    }

    companiesById = new Map(
      (companies ?? []).map((company) => [company.id, company]),
    );
  }

  const items = (candidates ?? []).map((candidate) => ({
    ...candidate,
    company: candidate.company_id
      ? (companiesById.get(candidate.company_id) ?? null)
      : null,
  }));

  return NextResponse.json({
    items,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.max(Math.ceil((count ?? 0) / pageSize), 1),
    },
  });
}
