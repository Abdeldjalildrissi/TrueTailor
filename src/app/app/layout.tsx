import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AppHeader } from "./header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return (
    <div className="min-h-dvh">
      <AppHeader displayName={user.displayName} email={user.email} />
      <main id="main" className="mx-auto w-full max-w-5xl px-6 py-10">
        {children}
      </main>
    </div>
  );
}
