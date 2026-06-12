/**
 * Decides whether a picked image needs normalization before upload.
 *
 * The CLI converts attachments to Claude API image blocks by magic-byte
 * sniffing and SKIPS anything that isn't JPEG/PNG/GIF/WebP — iOS HEIC would
 * be silently dropped. The Claude vision API also downscales anything over
 * 1568px long edge server-side and rejects images over 5MB, so uploading
 * larger is pure waste. Pure function — tested in attachmentNormalize.spec.ts.
 */

export const CLAUDE_VISION_MAX_EDGE = 1568;
export const NORMALIZE_JPEG_QUALITY = 0.9;

const CLAUDE_SUPPORTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export type NormalizationPlan =
    | { action: 'passthrough' }
    | { action: 'normalize'; resize: { width: number } | { height: number } | undefined };

export function planImageNormalization(input: {
    mimeType: string | undefined;
    width: number;
    height: number;
}): NormalizationPlan {
    const supported = input.mimeType !== undefined && CLAUDE_SUPPORTED_MIMES.has(input.mimeType);
    const longEdge = Math.max(input.width, input.height);
    const oversized = longEdge > CLAUDE_VISION_MAX_EDGE;

    if (supported && !oversized) {
        return { action: 'passthrough' };
    }

    let resize: { width: number } | { height: number } | undefined = undefined;
    if (oversized) {
        resize = input.width >= input.height
            ? { width: CLAUDE_VISION_MAX_EDGE }
            : { height: CLAUDE_VISION_MAX_EDGE };
    }
    return { action: 'normalize', resize };
}
