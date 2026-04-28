"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("margo@hei-dingo.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !json.ok) {
        setMessage(json.error ?? "Login failed.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Email</span>
        <input
          className="rounded-xl border border-stone-200 px-3 py-2 outline-none transition focus:border-stone-400"
          type="email"
          value={email}
          placeholder="margo@hei-dingo.com"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Password</span>
        <input
          className="rounded-xl border border-stone-200 px-3 py-2 outline-none transition focus:border-stone-400"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      <button
        className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
