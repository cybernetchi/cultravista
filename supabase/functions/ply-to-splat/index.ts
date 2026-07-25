// Supabase Edge Function for PLY to Splat conversion via AWS Lambda
// Uses background processing to handle Lambda's 2-3 minute execution time
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LAMBDA_URL = 'https://by6oy6pubv7yeppnm7fau42uam0geivb.lambda-url.us-east-2.on.aws/';

// Background task that calls Lambda and updates database
async function processConversion(s3Url: string, captureId: string) {
  console.log('Background task started:', { s3Url, captureId });
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Call AWS Lambda for conversion (this takes 2-3 minutes)
    console.log('Calling Lambda for PLY to Splat conversion:', s3Url);
    
    const response = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ s3_url: s3Url }),
    });

    const data = await response.json();
    console.log('Lambda response:', data);

    if (!response.ok || data.error) {
      throw new Error(data.error || `Lambda returned status ${response.status}`);
    }

    // Lambda output contract (PR5):
    //   { folder_path: string, files: { splat: string, ply?: string, spz?: string } }
    // `splat` is the antimatter15 delivery file (current default). When the
    // conversion Lambda is upgraded to also emit `ply` (archival original) and
    // `spz` (compact delivery), they are persisted here automatically.
    const folderPath = data.folder_path;
    const splatUrl = data.files?.splat;
    const plyUrl = data.files?.ply ?? null;
    const spzUrl = data.files?.spz ?? null;

    if (!folderPath && !splatUrl) {
      throw new Error('No folder_path or splat URL in Lambda response');
    }

    // Update database with successful result
    const { error: updateError } = await supabase
      .from('captures')
      .update({
        folder_path: folderPath || (splatUrl ? splatUrl.replace('/output.splat', '') : null),
        file: splatUrl || null,
        ply_url: plyUrl, // archival original (null until Lambda emits it)
        spz_url: spzUrl, // SPZ delivery (null until Lambda emits it)
        status: 1, // Complete
      })
      .eq('id', captureId);

    if (updateError) {
      console.error('Failed to update capture:', updateError);
      throw updateError;
    }

    console.log('Successfully updated capture:', captureId);
  } catch (error: unknown) {
    console.error('Background conversion failed:', error);
    
    // Update database with failed status
    const { error: updateError } = await supabase
      .from('captures')
      .update({ status: 2 }) // Failed
      .eq('id', captureId);

    if (updateError) {
      console.error('Failed to update capture status to failed:', updateError);
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { s3_url, capture_id } = await req.json();
    
    if (!s3_url) {
      throw new Error('s3_url parameter is required');
    }
    
    if (!capture_id) {
      throw new Error('capture_id parameter is required');
    }

    console.log('Received conversion request:', { s3_url, capture_id });

    // Start background task using EdgeRuntime.waitUntil
    // This allows the function to return immediately while continuing to process
    // @ts-expect-error - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processConversion(s3_url, capture_id));

    // Return immediately - the background task will update the database when complete
    return new Response(
      JSON.stringify({ 
        message: 'Conversion started',
        status: 'processing',
        capture_id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 202, // Accepted
      }
    );
  } catch (error: unknown) {
    console.error('Error in ply-to-splat function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
