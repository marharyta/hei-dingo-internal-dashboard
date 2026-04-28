import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APOLLO_API_KEY = process.env.APOLLO_API_KEY?.trim();

type ApolloUsageMetric = {
  label: string;
  value: string | number | boolean | null;
  path: string;
};

type ApolloUsageSummary = {
  ok: boolean;
  message?: string;
  credits: ApolloUsageMetric[];
  rateLimits: ApolloUsageMetric[];
  otherUsage: ApolloUsageMetric[];
  raw: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanizeKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function isPrimitiveMetric(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function collectMetrics(
  value: unknown,
  path: string[] = [],
  output: ApolloUsageMetric[] = [],
): ApolloUsageMetric[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectMetrics(item, [...path, String(index)], output);
    });

    return output;
  }

  if (!isRecord(value)) {
    return output;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = [...path, key];

    if (isPrimitiveMetric(nestedValue)) {
      output.push({
        label: humanizeKey(key),
        value: nestedValue,
        path: nextPath.join("."),
      });
    } else {
      collectMetrics(nestedValue, nextPath, output);
    }
  }

  return output;
}

function dedupeMetrics(metrics: ApolloUsageMetric[]) {
  const seen = new Set<string>();

  return metrics.filter((metric) => {
    const signature = `${metric.path}:${String(metric.value)}`;

    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

function normalizeApolloUsage(raw: unknown): ApolloUsageSummary {
  const allMetrics = dedupeMetrics(collectMetrics(raw));

  const credits = allMetrics.filter((metric) =>
    /credit|credits|remaining|used|usage|quota|available/i.test(metric.path),
  );

  const rateLimits = allMetrics.filter((metric) =>
    /rate|limit|minute|hour|daily|day|throttle|reset|remaining/i.test(
      metric.path,
    ),
  );

  const usedPaths = new Set(
    [...credits, ...rateLimits].map((metric) => metric.path),
  );

  const otherUsage = allMetrics
    .filter((metric) => !usedPaths.has(metric.path))
    .filter((metric) =>
      /api|endpoint|request|requests|calls|period|plan/i.test(metric.path),
    );

  return {
    ok: true,
    credits,
    rateLimits,
    otherUsage,
    raw,
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!APOLLO_API_KEY) {
    return NextResponse.json(
      { error: "APOLLO_API_KEY is not set." },
      { status: 500 },
    );
  }

  const response = await fetch(
    "https://api.apollo.io/api/v1/usage_stats/api_usage_stats",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      cache: "no-store",
    },
  );

  const text = await response.text();

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json(
      {
        error: "Apollo returned non-JSON response.",
        body: text,
      },
      { status: response.status },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          response.status === 403
            ? "Apollo usage stats require a master API key."
            : "Failed to load Apollo usage stats.",
        status: response.status,
        raw,
      },
      { status: response.status },
    );
  }

  return NextResponse.json(normalizeApolloUsage(raw));
}
