import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/app");
  }
  return (
    <main id="main" className="flex min-h-dvh flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-md pb-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          TrueTailor
        </Link>
      </div>
      <AuthForm mode="login" />
    </main>
  );
}
