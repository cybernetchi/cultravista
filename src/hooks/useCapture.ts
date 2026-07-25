// React Query hooks for KIRI and Capture operations
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KiriService } from '@/services/kiriService';
import { CaptureService } from '@/services/captureService';
import { StorageService } from '@/services/storageService';

// Capture hooks
export const useCaptures = () => {
  return useQuery({
    queryKey: ['captures'],
    queryFn: async () => {
      const result = await CaptureService.getAllCaptures();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
};

export const useCapture = (id: string) => {
  return useQuery({
    queryKey: ['capture', id],
    queryFn: async () => {
      const result = await CaptureService.getCapture(id);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: !!id,
  });
};

export const useCreateCapture = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: CaptureService.createCapture,
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['captures'] });
      }
    },
  });
};

export const useUpdateCapture = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; status?: number; thumbnail?: string; file?: string; serialize?: string; folder_path?: string } }) =>
      CaptureService.updateCapture(id, data),
    onSuccess: (result, variables) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['captures'] });
        queryClient.invalidateQueries({ queryKey: ['capture', variables.id] });
      }
    },
  });
};

// KIRI upload hook - complete upload flow
export const useKiriUpload = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      files,
      title,
      metadata,
      onProgress,
    }: {
      files: File[];
      title: string;
      // Optional archival metadata supplied at capture time (PR2).
      metadata?: {
        description?: string | null;
        capture_date?: string | null;
        location_text?: string | null;
        tags?: string[];
      };
      onProgress?: (progress: number) => void;
    }) => {
      // Step 1: Generate and upload thumbnail
      let thumbnailUrl: string | undefined;
      const hasVideo = files.some(file => file.type.startsWith('video/'));

      if (onProgress) onProgress(10);

      try {
        if (hasVideo) {
          // Extract video thumbnail
          const thumbnailBlob = await StorageService.extractVideoThumbnail(files[0]);
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
          const uploadResult = await StorageService.uploadThumbnail(thumbnailBlob, fileName);
          
          if (uploadResult.success && uploadResult.url) {
            thumbnailUrl = uploadResult.url;
          }
        } else {
          // Use first image as thumbnail
          const uploadResult = await StorageService.uploadImageAsThumbnail(files[0]);
          
          if (uploadResult.success && uploadResult.url) {
            thumbnailUrl = uploadResult.url;
          }
        }
      } catch (err) {
        console.error('Thumbnail generation/upload failed:', err);
        // Continue without thumbnail
      }

      if (onProgress) onProgress(20);

      // Step 2: Get KIRI token
      const tokenResult = await KiriService.getToken();
      if (!tokenResult.success || !tokenResult.token) {
        throw new Error(tokenResult.error || 'Failed to get upload token');
      }

      if (onProgress) onProgress(30);

      // Step 3: Upload to KIRI
      const uploadResult = await KiriService.uploadFiles(
        files,
        tokenResult.token,
        (progress) => {
          // Map KIRI progress to 30-80 range
          if (onProgress) onProgress(30 + (progress * 0.5));
        }
      );

      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error || 'KIRI upload failed');
      }

      if (onProgress) onProgress(85);

      // Step 4: Create database entry
      const captureResult = await CaptureService.createCapture({
        title: title.trim(),
        thumbnail: thumbnailUrl,
        serialize: uploadResult.data.serialize,
        ...metadata,
      });

      if (!captureResult.success || !captureResult.data) {
        throw new Error(captureResult.error || 'Failed to create capture');
      }

      if (onProgress) onProgress(100);

      return {
        captureId: captureResult.data.id,
        serialize: uploadResult.data.serialize,
        thumbnail: thumbnailUrl,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });
};

// KIRI status polling hook
export const useKiriStatus = (serialize: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['kiri-status', serialize],
    queryFn: async () => {
      const result = await KiriService.getStatus(serialize);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: enabled && !!serialize,
    refetchInterval: (query) => {
      // Stop polling on any terminal state
      const status = query.state.data?.status;
      console.log('KIRI status poll:', status);
      // KIRI status: -1=uploading, 0=processing, 1=failed, 2=successful, 3=queuing, 4=expired
      return status === 1 || status === 2 || status === 4 ? false : 5000;
    },
  });
};

// Get model zip URL hook
export const useGetModelZip = () => {
  return useMutation({
    mutationFn: async (serialize: string) => {
      const result = await KiriService.getModelZip(serialize);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
};

// PLY to Splat conversion hook (triggers AWS Lambda via fire-and-forget pattern)
// The edge function returns immediately and updates the database when Lambda completes
export const usePlyToSplatConversion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ s3Url, captureId }: { s3Url: string; captureId: string }) => {
      console.log('Triggering PLY to Splat conversion:', { s3Url, captureId });
      
      // Trigger background conversion via Edge Function
      // This returns immediately - the edge function updates the database when Lambda completes
      const result = await KiriService.convertPlyToSplat(s3Url, captureId);
      console.log('Conversion trigger result:', result);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to trigger PLY conversion');
      }

      // The database will be updated by the edge function when Lambda completes
      // Frontend should poll captures table to detect completion
      return result.data;
    },
    onSuccess: () => {
      // Invalidate immediately to show "converting" state
      queryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });
};

// Serializes currently being driven by a mounted useProcessingFlow in this tab.
// CaptureRecoveryManager consults this so it never attaches a second flow to a
// capture that an open create modal is already processing.
export const activeProcessingSerializes = new Set<string>();

// Complete processing flow hook - handles status polling and Lambda trigger
export const useProcessingFlow = (
  serialize: string | null,
  captureId: string | null,
  enabled: boolean = true
) => {
  const queryClient = useQueryClient();
  const getModelZip = useGetModelZip();
  const convertToSplat = usePlyToSplatConversion();

  // Track if we've triggered Lambda conversion (fire-and-forget)
  const [conversionTriggered, setConversionTriggered] = React.useState(false);

  // Register this flow as the active driver for its serialize while mounted.
  React.useEffect(() => {
    if (!enabled || !serialize) return;
    activeProcessingSerializes.add(serialize);
    return () => {
      activeProcessingSerializes.delete(serialize);
    };
  }, [serialize, enabled]);

  // Poll KIRI status
  const statusQuery = useKiriStatus(serialize || '', enabled && !!serialize);
  
  // Poll capture status to detect when Lambda completes (background updates the database)
  const captureQuery = useCapture(captureId || '');
  
  // Refetch capture periodically while waiting for Lambda to complete
  React.useEffect(() => {
    if (!conversionTriggered || !captureId) return;
    
    // Capture status: 0=processing, 1=complete, 2=failed
    const captureStatus = captureQuery.data?.status;
    if (captureStatus === 1 || captureStatus === 2) {
      // Lambda completed, stop polling
      console.log('Lambda conversion completed, capture status:', captureStatus);
      return;
    }
    
    // Poll every 5 seconds while waiting for Lambda
    const interval = setInterval(() => {
      console.log('Polling capture for Lambda completion...');
      queryClient.invalidateQueries({ queryKey: ['capture', captureId] });
      queryClient.invalidateQueries({ queryKey: ['captures'] });
    }, 5000);
    
    return () => clearInterval(interval);
  }, [conversionTriggered, captureId, captureQuery.data?.status, queryClient]);

  // Persist a terminal KIRI failure to the DB. Without this, a capture whose
  // KIRI job failed (status 1) or expired (status 4) stays at DB status 0
  // ("Processing") forever. Guarded by a ref so we write at most once.
  const markedFailedRef = React.useRef(false);
  React.useEffect(() => {
    const kiriStatus = statusQuery.data?.status;
    const isTerminalFailure = kiriStatus === 1 || kiriStatus === 4;
    // Only write when the row is still marked processing (0).
    if (!isTerminalFailure || !captureId || markedFailedRef.current) return;
    if (captureQuery.data?.status !== 0) return;

    markedFailedRef.current = true;
    CaptureService.updateCapture(captureId, { status: 2 })
      .then((res) => {
        if (res.success) {
          queryClient.invalidateQueries({ queryKey: ['captures'] });
          queryClient.invalidateQueries({ queryKey: ['capture', captureId] });
        } else {
          // Allow a retry on the next poll if the write itself failed.
          markedFailedRef.current = false;
        }
      })
      .catch(() => {
        markedFailedRef.current = false;
      });
  }, [statusQuery.data?.status, captureId, captureQuery.data?.status, queryClient]);

  // Define triggerConversion with useCallback BEFORE the useEffect
  const triggerConversion = React.useCallback(async () => {
    if (!serialize || !captureId) return;

    try {
      // Step 1: Get the model zip URL from KIRI
      const modelData = await getModelZip.mutateAsync(serialize);
      
      console.log('Model zip response:', modelData);
      
      // KIRI API returns modelUrl, not splatUrl
      const modelUrl = modelData?.modelUrl || modelData?.splatUrl;
      
      if (!modelUrl) {
        throw new Error('No model URL returned from KIRI');
      }

      // Step 2: Trigger Lambda conversion (fire-and-forget)
      // The edge function returns immediately and updates the database when Lambda completes
      await convertToSplat.mutateAsync({
        s3Url: modelUrl,
        captureId,
      });
      
      // Mark conversion as triggered - we'll poll the capture table for completion
      setConversionTriggered(true);
      console.log('Lambda conversion triggered, will poll for completion');

      queryClient.invalidateQueries({ queryKey: ['captures'] });
    } catch (error) {
      console.error('Conversion flow failed:', error);
      // Update status to failed
      if (captureId) {
        await CaptureService.updateCapture(captureId, { status: 2 });
      }
      throw error;
    }
  }, [serialize, captureId, getModelZip, convertToSplat, queryClient]);
  
  // Auto-trigger conversion when KIRI status becomes successful (status=2)
  // KIRI status codes: -1=uploading, 0=processing, 1=failed, 2=successful, 3=queuing, 4=expired
  React.useEffect(() => {
    const status = statusQuery.data?.status;
    
    console.log('Processing flow status check:', { status, serialize, captureId, isPending: getModelZip.isPending || convertToSplat.isPending, conversionTriggered });
    
    // Only trigger conversion on status 2 (successful) and if not already triggered
    if (status === 2 && serialize && captureId && !getModelZip.isPending && !convertToSplat.isPending && !conversionTriggered) {
      console.log('KIRI processing successful (status=2), triggering Lambda conversion:', serialize);
      triggerConversion();
    }
  }, [statusQuery.data?.status, serialize, captureId, getModelZip.isPending, convertToSplat.isPending, conversionTriggered, triggerConversion]);

  // Determine if Lambda is still running (conversion triggered but capture not yet updated)
  const captureStatus = captureQuery.data?.status;
  const isLambdaRunning = conversionTriggered && captureStatus === 0;

  return {
    status: statusQuery.data?.status,
    progress: statusQuery.data?.progress,
    isPolling: statusQuery.isFetching,
    isComplete: captureStatus === 1, // Capture status 1 = complete (Lambda finished)
    isFailed: statusQuery.data?.status === 1 || statusQuery.data?.status === 4 || captureStatus === 2,
    isConverting: getModelZip.isPending || convertToSplat.isPending || isLambdaRunning,
    conversionError: getModelZip.error || convertToSplat.error,
    triggerConversion,
  };
};