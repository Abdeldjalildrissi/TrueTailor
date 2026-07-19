import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfile } from "@/lib/profile/service";
import { ResumeManager } from "./resume-manager";

export const metadata: Metadata = { title: "Master resume" };

export default async function ResumePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const stored = await getProfile(user.id);

  return (
    <ResumeManager
      initialProfile={stored?.profile ?? null}
      initialWarnings={stored?.warnings ?? []}
      initialVersion={stored?.version ?? 0}
    />
  );
}
