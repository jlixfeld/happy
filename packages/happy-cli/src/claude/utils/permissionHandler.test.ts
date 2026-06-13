import { describe, it, expect, vi } from 'vitest';
import { PermissionHandler } from './permissionHandler';
import type { Session } from '../session';

/**
 * Builds a PermissionHandler with a minimal Session stub. The constructor only
 * touches `session.client.rpcHandlerManager.registerHandler` (to register the
 * permission RPC handler), so that's all the stub needs to provide.
 */
function makeHandler(): PermissionHandler {
    const session = {
        client: {
            rpcHandlerManager: { registerHandler: () => { } },
        },
    } as unknown as Session;
    return new PermissionHandler(session);
}

describe('PermissionHandler.handleModeChange', () => {
    // Regression guard for the bug where switching to `auto` never reached the
    // Claude binary. `auto` is implemented entirely by the binary's own
    // classifier — handleToolCall has no `auto` branch — so a mode change that
    // only updates the local field silently degrades `auto` to `default` and
    // prompts for everything. The change MUST be pushed to the live query.
    it('pushes the new mode to the live Claude query so the binary classifier is armed', () => {
        const handler = makeHandler();
        const updater = vi.fn(async () => { });
        handler.setPermissionModeUpdater(updater);

        handler.handleModeChange('auto');

        expect(updater).toHaveBeenCalledTimes(1);
        expect(updater).toHaveBeenCalledWith('auto');
    });

    it('maps Codex-flavoured modes to their Claude equivalent before pushing (yolo → bypassPermissions)', () => {
        const handler = makeHandler();
        const updater = vi.fn(async () => { });
        handler.setPermissionModeUpdater(updater);

        handler.handleModeChange('yolo');

        expect(updater).toHaveBeenCalledWith('bypassPermissions');
    });

    it('passes Claude-native modes through unchanged', () => {
        const handler = makeHandler();
        const updater = vi.fn(async () => { });
        handler.setPermissionModeUpdater(updater);

        handler.handleModeChange('acceptEdits');

        expect(updater).toHaveBeenCalledWith('acceptEdits');
    });

    it('does not throw when no live-query updater has been registered yet', () => {
        const handler = makeHandler();
        expect(() => handler.handleModeChange('auto')).not.toThrow();
    });
});
