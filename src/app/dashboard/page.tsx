import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/internal-auth";
import { PeoplePullDashboard } from "./people-pull-dashboard";
import { CandidatesTable } from "./candidates-table";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-8 text-stone-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-500">
              Hei Dingo Internal
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              People pull dashboard
            </h1>
            <p className="max-w-2xl text-sm text-stone-600">
              Signed in as {session.email}. Pull people from Apollo into the
              existing Supabase database.
            </p>
          </div>
        </header>

        <PeoplePullDashboard email={session.email} />
        <CandidatesTable />
      </div>
    </main>
  );
}
