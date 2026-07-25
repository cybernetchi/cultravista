// Supabase Edge Function for AWS S3 uploads.
// Two modes:
//   - multipart/form-data (legacy): the file passes through this function to S3.
//     Only viable for small files — the whole body is buffered in memory.
//   - JSON { mode: "presign", captureId, kind }: returns a short-lived presigned
//     S3 PUT URL so the browser uploads large files (30–200MB splats/PLYs)
//     directly to S3. AWS credentials never leave this function; the object key
//     is derived server-side from the caller's user id, so clients cannot write
//     to arbitrary key prefixes.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRESIGN_EXPIRY_SECONDS = "900"; // 15 minutes — plenty for a 200MB upload

// Presign mode: validate the caller + capture ownership, then return a signed
// PUT URL for an owner-scoped key. No file bytes touch this function.
async function handlePresign(req: Request, aws: AwsClient, bucket: string, region: string) {
  const { mode, captureId, kind } = await req.json();

  if (mode !== "presign") {
    return jsonResponse({ success: false, error: "Unsupported mode" }, 400);
  }
  if (kind !== "ply" && kind !== "splat") {
    return jsonResponse({ success: false, error: "kind must be 'ply' or 'splat'" }, 400);
  }
  if (typeof captureId !== "string" || !UUID_RE.test(captureId)) {
    return jsonResponse({ success: false, error: "captureId must be a UUID" }, 400);
  }

  // Resolve the caller from the forwarded JWT. The gateway already enforced
  // verify_jwt, but we need the user id for the key and to scope the RLS check.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ success: false, error: "Missing Authorization header" }, 401);
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ success: false, error: "Not authenticated" }, 401);
  }

  // RLS-scoped lookup: the capture must exist and be visible to the caller
  // (org member), otherwise we refuse to sign a URL for it.
  const { data: captureRow, error: captureError } = await supabase
    .from("captures")
    .select("id")
    .eq("id", captureId)
    .maybeSingle();
  if (captureError || !captureRow) {
    return jsonResponse({ success: false, error: "Capture not found" }, 404);
  }

  const fileName = kind === "ply" ? "source.ply" : "model.splat";
  const key = `uploads/${userData.user.id}/${captureId}/${fileName}`;

  const objectUrl = new URL(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);
  objectUrl.searchParams.set("X-Amz-Expires", PRESIGN_EXPIRY_SECONDS);
  const signed = await aws.sign(new Request(objectUrl, { method: "PUT" }), {
    aws: { signQuery: true },
  });

  return jsonResponse(
    {
      success: true,
      url: signed.url,
      key,
      // Unsigned URL of the object once uploaded — what gets stored in the DB.
      publicUrl: objectUrl.origin + objectUrl.pathname,
    },
    200,
  );
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Trim secrets defensively — a pasted trailing space/newline in the key
    // produces SignatureDoesNotMatch on every request (same class of problem
    // as the AWS_REGION console-label paste handled below).
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")?.trim();
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")?.trim();
    // Tolerate a region secret pasted as the AWS console label (e.g.
    // "US East (N. Virginia) us-east-1") by extracting the region code —
    // interpolating the raw label into the endpoint produces an invalid URL.
    const rawRegion = Deno.env.get("AWS_REGION") || "us-east-1";
    const AWS_REGION = rawRegion.match(/[a-z]{2}(?:-[a-z]+)+-\d/)?.[0] ?? "us-east-1";
    const S3_BUCKET = Deno.env.get("S3_BUCKET")?.trim();

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !S3_BUCKET) {
      throw new Error("AWS credentials not configured");
    }

    const aws = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION,
      service: "s3",
    });

    // JSON body → presign mode; multipart → legacy pass-through upload.
    if (req.headers.get("content-type")?.includes("application/json")) {
      return await handlePresign(req, aws, S3_BUCKET, AWS_REGION);
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const folder = (formData.get("folder") as string) || "uploads";
    const fileName = formData.get("fileName") as string;

    if (!file) {
      throw new Error("No file provided");
    }

    // Generate unique filename if not provided
    const finalFileName = fileName || `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const key = `${folder}/${finalFileName}`;

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const contentType = file.type || "application/octet-stream";

    // S3 endpoint
    const url = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;

    // Upload to S3 using aws4fetch
    const response = await aws.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: arrayBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("S3 Error:", errorText);
      throw new Error(`S3 upload failed: ${response.status} ${response.statusText}`);
    }

    console.log("Upload successful:", url);

    return new Response(JSON.stringify({ success: true, url, key }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    console.error("Error in s3-upload function:", error);
    const errorMessage = error instanceof Error ? error.message : "Upload failed";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
