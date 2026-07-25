// Supabase Edge Function for AWS S3 uploads
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    // Tolerate a region secret pasted as the AWS console label (e.g.
    // "US East (N. Virginia) us-east-1") by extracting the region code —
    // interpolating the raw label into the endpoint produces an invalid URL.
    const rawRegion = Deno.env.get("AWS_REGION") || "us-east-1";
    const AWS_REGION = rawRegion.match(/[a-z]{2}(?:-[a-z]+)+-\d/)?.[0] ?? "us-east-1";
    const S3_BUCKET = Deno.env.get("S3_BUCKET");

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !S3_BUCKET) {
      throw new Error("AWS credentials not configured");
    }

    const aws = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION,
      service: "s3",
    });

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
