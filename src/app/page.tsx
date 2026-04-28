import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 text-stone-950">
      <div className="mx-auto flex max-w-md flex-col gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-500">
            Hei Dingo Internal
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-stone-600">
            Use the internal Hei Dingo dashboard credentials.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
