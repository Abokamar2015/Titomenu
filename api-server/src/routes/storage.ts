import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod/v4";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  requireUser,
  requireRestaurantRole,
  type AuthedRequest,
} from "../lib/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const RequestUploadUrlBody = z.object({
  name: z.string().optional(),
  size: z.number().optional(),
  contentType: z.string().optional(),
});

/**
 * POST /restaurants/:restaurantId/storage/uploads/request-url
 *
 * Request a signed URL for file upload (Supabase Storage), scoped to a
 * restaurant the caller is a member of.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned signed URL via PUT.
 */
router.post(
  "/restaurants/:restaurantId/storage/uploads/request-url",
  requireUser,
  requireRestaurantRole("owner", "manager", "staff"),
  async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const { uploadURL, objectPath } = await objectStorageService.createSignedUpload();

    res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /me/storage/uploads/request-url
 *
 * Signed upload URL for the caller's own profile avatar. Requires only an
 * authenticated user (no restaurant membership — super admins included).
 */
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const AVATAR_MIME = /^image\/(png|jpe?g|webp|gif|avif)$/i;
// Naive in-memory per-user rate limit for avatar upload URL issuance.
const avatarUploadHits = new Map<string, { count: number; resetAt: number }>();
function avatarRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = avatarUploadHits.get(userId);
  if (!entry || now > entry.resetAt) {
    avatarUploadHits.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 20; // max 20 URL requests per hour per user
}

router.post(
  "/me/storage/uploads/request-url",
  requireUser,
  async (req: AuthedRequest, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }
    const { size, contentType } = parsed.data;
    if (!contentType || !AVATAR_MIME.test(contentType)) {
      res.status(400).json({ error: "Only image uploads are allowed" });
      return;
    }
    if (!size || size <= 0 || size > AVATAR_MAX_BYTES) {
      res.status(400).json({ error: "Image must be 5MB or smaller" });
      return;
    }
    if (avatarRateLimited(req.user!.id)) {
      res.status(429).json({ error: "Too many uploads, try again later" });
      return;
    }
    try {
      const { name } = parsed.data;
      const { uploadURL, objectPath } =
        await objectStorageService.createSignedUpload();
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      req.log.error({ err: error }, "Error generating avatar upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

function proxyObject(key: string) {
  return async (req: Request, res: Response) => {
    try {
      const response = await objectStorageService.fetchObject(key);
      res.status(200);
      const contentType = response.headers.get("content-type");
      const contentLength = response.headers.get("content-length");
      if (contentType) res.setHeader("Content-Type", contentType);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      res.setHeader("Cache-Control", "public, max-age=3600");

      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  };
}

/**
 * GET /storage/objects/*
 *
 * Serve uploaded objects (e.g. /storage/objects/uploads/<uuid>).
 * Image URLs stored in the database look like /api/storage/objects/uploads/<uuid>,
 * so this route shape must remain stable.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  const raw = req.params.path;
  const key = Array.isArray(raw) ? raw.join("/") : raw;
  await proxyObject(key)(req, res);
});

/**
 * GET /storage/public-objects/*
 *
 * Legacy public-assets route; serves from the same bucket under public/.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  const raw = req.params.filePath;
  const key = `public/${Array.isArray(raw) ? raw.join("/") : raw}`;
  await proxyObject(key)(req, res);
});

export default router;
