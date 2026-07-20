import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfilePhoto } from "@/lib/profile/photo";
import { getProfile } from "@/lib/profile/service";
import { ResumeManager } from "./resume-manager";

export const metadata: Metadata = { title: "Master resume" };

export default async function ResumePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const stored = await getProfile(user.id);
  const photo = stored ? await getProfilePhoto(user.id) : null;

  return (
    <ResumeManager
      initialProfile={stored?.profile ?? null}
      initialWarnings={stored?.warnings ?? []}
      initialVersion={stored?.version ?? 0}
      initialHasPhoto={Boolean(photo)}
    />
  );
}
