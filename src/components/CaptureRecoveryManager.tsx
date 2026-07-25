// Recovery driver for captures stuck in "Processing" (status 0).
//
// The KIRI → Lambda handoff is client-driven (useProcessingFlow): if the tab
// is closed mid-processing, nothing ever finishes the capture and the row
// stays at status 0 forever. This component runs once inside the authed app
// shell, finds the current user's stuck captures, and re-attaches the normal
// processing flow to each so they complete (or are marked failed) without any
// server-side scheduler.
//
// Rules:
// - Only rows with a KIRI `serialize` can be resumed; rows without one can
//   never complete and are marked failed so the user can delete them.
// - Rows younger than STALE_MS are skipped: an open create modal is normally
//   still driving them (also guarded by activeProcessingSerializes).
// - Once attached, a resume stays mounted until it reaches a terminal state;
//   useProcessingFlow stops all polling on its own after that.
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useProcessingFlow, activeProcessingSerializes } from '@/hooks/useCapture';
import { CaptureService, Capture } from '@/services/captureService';

// Age a status-0 row must reach before we treat it as abandoned. Fresh rows
// are assumed to be driven by the create modal that just inserted them.
const STALE_MS = 2 * 60 * 1000;

// Re-check cadence while stuck candidates might appear (e.g. the user closes
// the create modal mid-processing without closing the app).
const RECHECK_MS = 60 * 1000;

// Invisible per-capture worker: re-runs the standard processing flow and
// reports the terminal outcome via toasts.
function CaptureResume({ capture }: { capture: Capture }) {
  const { isComplete, isFailed, isConverting } = useProcessingFlow(
    capture.serialize,
    capture.id,
    true
  );

  // Announce the terminal state exactly once.
  const announcedRef = React.useRef(false);
  React.useEffect(() => {
    if (announcedRef.current) return;
    if (isComplete && !isConverting) {
      announcedRef.current = true;
      toast.success(`"${capture.title}" finished processing`);
    } else if (isFailed) {
      announcedRef.current = true;
      toast.error(`"${capture.title}" could not be processed. You can delete it from the library.`);
    }
  }, [isComplete, isFailed, isConverting, capture.title]);

  return null;
}

export function CaptureRecoveryManager() {
  const queryClient = useQueryClient();

  // Shares the ['captures'] cache with the library views; polls slowly only
  // while there are still unresumed processing rows to pick up.
  const { data: captures } = useQuery({
    queryKey: ['captures'],
    queryFn: async () => {
      const result = await CaptureService.getAllCaptures();
      if (!result.success) throw new Error(result.error);
      return result.data || [];
    },
    refetchInterval: (query) => {
      const hasUnresumedProcessing = query.state.data?.some(
        (c: Capture) => c.status === 0 && (!c.serialize || !activeProcessingSerializes.has(c.serialize))
      );
      return hasUnresumedProcessing ? RECHECK_MS : false;
    },
  });

  // Captures we have attached a resume flow to. Kept for the session even
  // after they finish, so workers are never unmounted mid-flight.
  const [attachedIds, setAttachedIds] = React.useState<string[]>([]);
  // Per-session guards so toasts/failure writes fire once per capture.
  const announcedResumeRef = React.useRef(new Set<string>());
  const markedFailedRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!captures) return;
    const now = Date.now();

    const newlyStuck: Capture[] = [];
    for (const capture of captures) {
      if (capture.status !== 0) continue;
      if (attachedIds.includes(capture.id)) continue;
      // Give a just-created row time to be driven by its create modal.
      if (now - new Date(capture.created_at).getTime() < STALE_MS) continue;

      if (!capture.serialize) {
        // No KIRI job reference — unrecoverable. Mark failed so it stops
        // showing an eternal spinner and becomes deletable.
        if (!markedFailedRef.current.has(capture.id)) {
          markedFailedRef.current.add(capture.id);
          CaptureService.updateCapture(capture.id, { status: 2 }).then((res) => {
            if (res.success) {
              queryClient.invalidateQueries({ queryKey: ['captures'] });
              toast.error(
                `"${capture.title}" cannot be resumed and was marked failed. You can delete it from the library.`
              );
            } else {
              markedFailedRef.current.delete(capture.id);
            }
          });
        }
        continue;
      }

      // Another mounted flow (an open create modal) is already driving it.
      if (activeProcessingSerializes.has(capture.serialize)) continue;

      newlyStuck.push(capture);
    }

    if (newlyStuck.length === 0) return;

    for (const capture of newlyStuck) {
      if (!announcedResumeRef.current.has(capture.id)) {
        announcedResumeRef.current.add(capture.id);
        toast.info(`Resuming processing for "${capture.title}"…`);
      }
    }
    setAttachedIds((prev) => [
      ...prev,
      ...newlyStuck.map((c) => c.id).filter((id) => !prev.includes(id)),
    ]);
  }, [captures, attachedIds, queryClient]);

  return (
    <>
      {attachedIds.map((id) => {
        const capture = captures?.find((c) => c.id === id);
        // Row deleted while attached — nothing to drive.
        if (!capture || !capture.serialize) return null;
        return <CaptureResume key={id} capture={capture} />;
      })}
    </>
  );
}
