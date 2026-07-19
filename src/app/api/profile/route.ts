import { NextResponse } from "next/server";
import { jsonError, parseJsonBody, requireUser } from "@/lib/http/api";
import { profileInputSchema } from "@/lib/profile/schema";
import { getProfile, ProfileValidationError, updateProfile } from "@/lib/profile/service";

export async function GET(req: Request) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }
  const stored = await getProfile(user.id);
  if (!stored) {
    return NextResponse.json({ profile: null });
  }
  return NextResponse.json({
    profile: stored.profile,
    warnings: stored.warnings,
    version: stored.version,
    updatedAt: stored.updatedAt.toISOString()
  });
}

export async function PUT(req: Request) {
  const { user, response: authResponse } = await requireUser(req);
  if (!user) {
    return authResponse;
  }
  const { data, response } = await parseJsonBody(req, profileInputSchema);
  if (!data) {
    return response;
  }
  try {
    const stored = await updateProfile(user.id, data);
    return NextResponse.json({
      profile: stored.profile,
      warnings: stored.warnings,
      version: stored.version,
      updatedAt: stored.updatedAt.toISOString()
    });
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return jsonError(400, error.message, { details: error.issues });
    }
    throw error;
  }
}
