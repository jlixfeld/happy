import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { type NormalizationPlan, NORMALIZE_JPEG_QUALITY } from './attachmentNormalize';

/**
 * Applies a normalization plan to an image URI. Returns the (possibly new)
 * uri + dimensions + mime. Native + web (expo-image-manipulator supports both).
 * Not unit-tested — exercised manually; the decision logic carries the tests
 * (see attachmentNormalize.spec.ts). Lives in a separate file so vitest/node
 * can import the pure logic without loading the native expo-image-manipulator module.
 */
export async function normalizeImage(
    uri: string,
    plan: NormalizationPlan,
    originalMimeType: string | undefined,
): Promise<{ uri: string; width: number; height: number; mimeType: string } | null> {
    if (plan.action === 'passthrough') return null;
    const context = ImageManipulator.manipulate(uri);
    if (plan.resize) {
        context.resize(plan.resize);
    }
    const image = await context.renderAsync();
    // PNGs stay PNG (lossless, keeps transparency — screenshots); everything
    // else (HEIC, oversized JPEG, ...) re-encodes as JPEG.
    const keepPng = originalMimeType === 'image/png';
    const result = await image.saveAsync(
        keepPng
            ? { format: SaveFormat.PNG }
            : { format: SaveFormat.JPEG, compress: NORMALIZE_JPEG_QUALITY },
    );
    return { uri: result.uri, width: result.width, height: result.height, mimeType: keepPng ? 'image/png' : 'image/jpeg' };
}
