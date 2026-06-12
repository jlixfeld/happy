import { describe, it, expect } from 'vitest';
import { planImageNormalization, CLAUDE_VISION_MAX_EDGE } from './attachmentNormalize';

describe('planImageNormalization', () => {
    it('passes through a small JPEG untouched', () => {
        expect(planImageNormalization({ mimeType: 'image/jpeg', width: 800, height: 600 }))
            .toEqual({ action: 'passthrough' });
    });

    it('converts HEIC to JPEG', () => {
        expect(planImageNormalization({ mimeType: 'image/heic', width: 800, height: 600 }))
            .toEqual({ action: 'normalize', resize: undefined });
    });

    it('downscales an oversized JPEG to 1568px long edge (landscape)', () => {
        expect(planImageNormalization({ mimeType: 'image/jpeg', width: 4032, height: 3024 }))
            .toEqual({ action: 'normalize', resize: { width: CLAUDE_VISION_MAX_EDGE } });
    });

    it('downscales an oversized PNG to 1568px long edge (portrait)', () => {
        expect(planImageNormalization({ mimeType: 'image/png', width: 3024, height: 4032 }))
            .toEqual({ action: 'normalize', resize: { height: CLAUDE_VISION_MAX_EDGE } });
    });

    it('passes through supported formats at exactly the ceiling', () => {
        expect(planImageNormalization({ mimeType: 'image/webp', width: 1568, height: 1000 }))
            .toEqual({ action: 'passthrough' });
    });

    it('normalizes unknown/missing mime types defensively', () => {
        expect(planImageNormalization({ mimeType: undefined, width: 800, height: 600 }))
            .toEqual({ action: 'normalize', resize: undefined });
    });

    it('treats zero dimensions as unknown size — converts format only', () => {
        expect(planImageNormalization({ mimeType: 'image/heic', width: 0, height: 0 }))
            .toEqual({ action: 'normalize', resize: undefined });
    });
});
