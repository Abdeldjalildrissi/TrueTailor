import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/http/api";
import {
  deleteProfilePhoto,
  getProfilePhoto,
  MAX_PHOTO_BYTES,
  setProfilePhoto,
  sniffImageMime
} from "@/lib/profile/photo";

/**
 * The optional profile photo. It is identity data the user provides —
 * uploaded, previewed, and deleted here; consumed only by exports whose
 * template includes a photo placement (the LaTeX template). No AI touches it.
 */

export async function GET(req: Request) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }
  const photo = await getProfilePhoto(user.id);
  if (!photo) {
    return jsonError(404, "No profile photo uploaded.");
  }
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      "content-type": photo.mime,
      "cache-control": "no-store",
      "content-disposition": 'inline; filename="profile-photo"'
    }
  });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Malformed upload. Please try again.");
  }
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return jsonError(400, 'Attach an image in the "photo" field.');
  }
  if (file.size === 0) {
    return jsonError(400, "The uploaded image is empty.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return jsonError(413, "Photo is too large — the limit is 2 MB.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return jsonError(415, "Unsupported image format. Upload a JPEG or PNG photo.");
  }

  await setProfilePhoto(user.id, mime, bytes);
  return NextResponse.json({ ok: true, mime, byteSize: bytes.length });
}

export async function DELETE(req: Request) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }
  const removed = await deleteProfilePhoto(user.id);
  if (!removed) {
    return jsonError(404, "No profile photo to remove.");
  }
  return NextResponse.json({ ok: true });
}
