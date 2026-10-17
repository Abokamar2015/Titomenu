import { randomUUID } from "crypto";

/**
 * Supabase Storage backend.
 *
 * Env vars:
 * - SUPABASE_URL: project URL (https://<ref>.supabase.co). Any path (e.g. /rest/v1) is stripped.
 * - SUPABASE_SERVICE_ROLE_KEY: service role key (server-side only).
 * - SUPABASE_STORAGE_BUCKET (optional): bucket name, defaults to "menu-images".
 *
 * Object keys are "uploads/<uuid>", matching the historical
 * "/api/storage/objects/uploads/<uuid>" image URLs stored in the database.
 */

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function getSupabaseOrigin(): string {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) throw new Error("SUPABASE_URL not set");
  return new URL(raw).origin;
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return key;
}

export function getBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "menu-images";
}

export class ObjectStorageService {
  /**
   * Create a signed upload URL for a new object under uploads/<uuid>.
   * Returns the absolute upload URL (client PUTs the file body to it)
   * and the objectPath "/objects/uploads/<uuid>" used to build the final
   * "/api/storage/objects/uploads/<uuid>" image URL on the client.
   */
  async createSignedUpload(): Promise<{ uploadURL: string; objectPath: string }> {
    const origin = getSupabaseOrigin();
    const bucket = getBucket();
    const key = `uploads/${randomUUID()}`;

    const res = await fetch(
      `${origin}/storage/v1/object/upload/sign/${bucket}/${key}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getServiceKey()}`,
          apikey: getServiceKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to create signed upload URL (${res.status}): ${body}`);
    }
    const { url } = (await res.json()) as { url: string };
    // `url` is relative to the storage API root, e.g. "/object/upload/sign/...?token=..."
    const uploadURL = `${origin}/storage/v1${url.startsWith("/") ? "" : "/"}${url}`;
    return { uploadURL, objectPath: `/objects/${key}` };
  }

  /** Public URL for an object key (bucket is public). */
  publicUrl(key: string): string {
    return `${getSupabaseOrigin()}/storage/v1/object/public/${getBucket()}/${key}`;
  }

  /**
   * Fetch an object from Supabase Storage for proxying to the client.
   * Throws ObjectNotFoundError when it doesn't exist.
   */
  async fetchObject(key: string): Promise<globalThis.Response> {
    const res = await fetch(this.publicUrl(key), {
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 400 || res.status === 404) throw new ObjectNotFoundError();
    if (!res.ok) throw new Error(`Failed to fetch object (${res.status})`);
    return res;
  }
}
