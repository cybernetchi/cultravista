// Capture service using Supabase Database
import { supabase } from '@/integrations/supabase/client';
import { resolveOwnerAndOrg } from './orgContext';
import type { Scan } from '@/types/scan';

export interface Capture {
  id: string;
  title: string; // canonical English title
  status: number; // DB status: 0=processing, 1=complete, 2=failed (Note: differs from KIRI API status)
  thumbnail: string | null;
  file: string | null;
  serialize: string | null;
  folder_path: string | null;
  owner_id: string | null; // auth.users id of the creator (set by RLS-scoped insert)
  org_id: string | null; // organization the capture is scoped to
  // PR2 archival metadata
  title_zh_hant: string | null;
  description: string | null;
  description_zh_hant: string | null;
  capture_date: string | null; // ISO date (YYYY-MM-DD)
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  rights_license: string | null;
  attribution: string | null;
  tags: string[];
  source: string; // 'kiri' | 'upload'
  published: boolean; // PR4: visible publicly at /exhibit/:slug
  slug: string | null;
  ply_url: string | null; // PR5: archival original PLY (S3)
  spz_url: string | null; // PR5: SPZ delivery file (S3)
  created_at: string;
  updated_at: string;
}

// Fields a caller may set when creating/updating a capture. owner_id/org_id are
// stamped by the service, not the caller.
interface CaptureMetadata {
  title_zh_hant?: string | null;
  description?: string | null;
  description_zh_hant?: string | null;
  capture_date?: string | null;
  location_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  rights_license?: string | null;
  attribution?: string | null;
  tags?: string[];
}

interface CaptureInsert extends CaptureMetadata {
  title: string;
  status?: number;
  thumbnail?: string;
  file?: string;
  serialize?: string;
  folder_path?: string;
  source?: string;
}

interface CaptureUpdate extends CaptureMetadata {
  title?: string;
  status?: number;
  thumbnail?: string;
  file?: string;
  serialize?: string;
  folder_path?: string;
  // PR8: a directly-uploaded PLY stores its archival URL before conversion.
  ply_url?: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Lightweight summary of a published exhibit for public surfaces (landing demo).
export type PublishedCaptureSummary = Pick<
  Capture,
  'id' | 'slug' | 'title' | 'title_zh_hant' | 'description' | 'description_zh_hant' | 'thumbnail'
>;

export class CaptureService {
  // Create new capture
  static async createCapture(data: CaptureInsert): Promise<ApiResponse<Capture>> {
    try {
      const scope = await resolveOwnerAndOrg();
      if ('error' in scope) {
        return { success: false, error: scope.error };
      }

      const { data: capture, error } = await supabase
        .from('captures')
        .insert({
          ...data,
          status: data.status ?? 0, // 0 = processing
          source: data.source ?? 'kiri',
          owner_id: scope.ownerId,
          org_id: scope.orgId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating capture:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: capture };
    } catch (error) {
      console.error('Error creating capture:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create capture',
      };
    }
  }

  // Update existing capture
  static async updateCapture(id: string, data: CaptureUpdate): Promise<ApiResponse<Capture>> {
    try {
      const { data: capture, error } = await supabase
        .from('captures')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating capture:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: capture };
    } catch (error) {
      console.error('Error updating capture:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update capture',
      };
    }
  }

  // Delete a capture. RLS only permits this for an owner/admin of the capture's
  // org, so an unauthorized call returns 0 rows (surfaced here as an error).
  static async deleteCapture(id: string): Promise<ApiResponse<null>> {
    try {
      const { data, error } = await supabase
        .from('captures')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) {
        console.error('Error deleting capture:', error);
        return { success: false, error: error.message };
      }
      if (!data || data.length === 0) {
        return { success: false, error: "You don't have permission to delete this scan." };
      }

      return { success: true, data: null };
    } catch (error) {
      console.error('Error deleting capture:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete capture',
      };
    }
  }

  // Get single capture
  static async getCapture(id: string): Promise<ApiResponse<Capture>> {
    try {
      const { data: capture, error } = await supabase
        .from('captures')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error getting capture:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: capture };
    } catch (error) {
      console.error('Error getting capture:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get capture',
      };
    }
  }

  // Get all captures
  static async getAllCaptures(): Promise<ApiResponse<Capture[]>> {
    try {
      const { data: captures, error } = await supabase
        .from('captures')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting captures:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: captures };
    } catch (error) {
      console.error('Error getting captures:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get captures',
      };
    }
  }

  // ---- PR4: publishing -----------------------------------------------------

  // Publish a capture as a public exhibit, generating a unique slug from the
  // title. Retries with a fresh suffix on a slug collision.
  static async publishCapture(id: string, title: string): Promise<ApiResponse<Capture>> {
    const base = slugify(title) || 'exhibit';
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = `${base}-${randomSuffix()}`;
      const { data, error } = await supabase
        .from('captures')
        .update({ published: true, slug })
        .eq('id', id)
        .select()
        .single();

      if (!error) return { success: true, data };
      // 23505 = unique_violation -> try a different suffix.
      if (error.code !== '23505') {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'Could not generate a unique exhibit link. Try again.' };
  }

  // Take an exhibit offline. The slug is kept so re-publishing is stable.
  static async unpublishCapture(id: string): Promise<ApiResponse<Capture>> {
    const { data, error } = await supabase
      .from('captures')
      .update({ published: false })
      .eq('id', id)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  // Anon-safe read of a published exhibit by slug (RLS enforces published-only).
  static async getPublishedCaptureBySlug(slug: string): Promise<ApiResponse<Capture>> {
    try {
      const { data, error } = await supabase
        .from('captures')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();

      if (error) return { success: false, error: error.message };
      if (!data) return { success: false, error: 'Exhibit not found' };
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load exhibit',
      };
    }
  }

  // Anon-safe list of published exhibits for public surfaces (landing demo).
  // The PR4 RLS policy "Public can view published captures" permits this SELECT
  // without a session. Newest first; only slugged rows are embeddable.
  static async getPublishedCaptures(limit = 2): Promise<ApiResponse<PublishedCaptureSummary[]>> {
    try {
      const { data, error } = await supabase
        .from('captures')
        .select('id, slug, title, title_zh_hant, description, description_zh_hant, thumbnail')
        .eq('published', true)
        .not('slug', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return { success: false, error: error.message };
      return { success: true, data: data ?? [] };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load exhibits',
      };
    }
  }
}

// Build a URL-safe slug from a title (lowercase, hyphenated, ASCII-ish).
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ---- PR5: delivery format selection ----------------------------------------
// SPZ rendering is not yet wired into the viewer (the @spz-loader decoder path
// is validated — see docs/spz-format-decision.md — but integration is deferred
// until the conversion Lambda emits SPZ). Flip this to true once the viewer
// decodes SPZ, and delivery will prefer the smaller spz_url automatically.
export const SPZ_RENDERING_ENABLED = false;

// Best splat URL to hand the viewer: SPZ delivery when enabled + available,
// otherwise the legacy antimatter15 .splat in the capture's S3 folder.
export function deliverySplatUrl(
  c: Pick<Capture, "folder_path" | "file" | "spz_url">
): string | undefined {
  if (SPZ_RENDERING_ENABLED && c.spz_url) return c.spz_url;
  // `file` wins so an edited/cropped splat overrides the original. For
  // unedited captures `file` already equals the original output.splat URL.
  if (c.file) return c.file;
  if (c.folder_path) return `${c.folder_path}/output.splat`;
  return undefined;
}

// Identity of the signed-in viewer, used to attribute their own captures.
export interface ViewerIdentity {
  id: string;
  name: string;
  handle: string;
}

// Derive a ViewerIdentity from a Supabase auth user (same rules as the profile
// views: OAuth full name first, then the email local-part).
export function viewerIdentity(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined
): ViewerIdentity | undefined {
  if (!user) return undefined;
  const emailName = user.email ? user.email.split('@')[0] : '';
  const name =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    emailName;
  return {
    id: user.id,
    name: name || 'You',
    handle: emailName ? `@${emailName}` : '',
  };
}

// Map a DB capture row to the UI `Scan` shape. Shared by the Library and Profile
// so both render the same real data. Attribution is only shown for captures the
// viewer owns — RLS hides other members' profiles, so rather than showing a
// dummy handle for their captures we show nothing.
export function captureToScan(capture: Capture, viewer?: ViewerIdentity): Scan {
  const isOwn = !!viewer && capture.owner_id === viewer.id;
  return {
    id: capture.id,
    title: capture.title,
    author: isOwn ? viewer.name : "",
    authorHandle: isOwn ? viewer.handle : "",
    thumbnail: capture.thumbnail || "/placeholder.svg",
    createdAt: new Date(capture.created_at),
    splatUrl: deliverySplatUrl(capture),
    status: capture.status, // 0=processing, 1=complete, 2=failed
    folderPath: capture.folder_path || undefined,
    // PR2 archival metadata
    titleZhHant: capture.title_zh_hant,
    description: capture.description,
    descriptionZhHant: capture.description_zh_hant,
    captureDate: capture.capture_date,
    locationText: capture.location_text,
    lat: capture.lat,
    lng: capture.lng,
    rightsLicense: capture.rights_license,
    attribution: capture.attribution,
    tags: capture.tags,
    source: capture.source,
    location: capture.location_text || undefined,
    published: capture.published,
    slug: capture.slug,
    plyUrl: capture.ply_url,
    spzUrl: capture.spz_url,
  };
}