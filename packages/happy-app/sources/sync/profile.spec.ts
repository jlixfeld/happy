import { describe, it, expect } from 'vitest';
import { profileParse, profileDefaults } from './profile';

describe('profileParse', () => {
    it('should return defaults for invalid input', () => {
        expect(profileParse(null)).toEqual(profileDefaults);
        expect(profileParse(undefined)).toEqual(profileDefaults);
        expect(profileParse({})).toEqual(profileDefaults);
    });

    it('should parse a profile whose GitHub name and email are null', () => {
        // Real server payload for a user with a GitHub account that has no
        // public name/email set. The server sends explicit nulls for these
        // fields. The schema must accept them instead of throwing a ZodError
        // and discarding the entire (otherwise valid) profile.
        const serverProfile = {
            id: 'user_123',
            timestamp: 1700000000,
            firstName: 'Ada',
            lastName: null,
            avatar: null,
            github: {
                id: 42,
                login: 'ada',
                name: null,
                avatar_url: 'https://avatars.githubusercontent.com/u/42',
                email: null,
                bio: null,
            },
            connectedServices: ['github'],
        };

        const parsed = profileParse(serverProfile);

        // The whole GitHub object must survive parsing, not be dropped to null.
        expect(parsed.github).not.toBeNull();
        expect(parsed.github?.login).toBe('ada');
        expect(parsed.github?.name).toBeNull();
        expect(parsed.github?.email).toBeNull();
        expect(parsed.id).toBe('user_123');
        expect(parsed.connectedServices).toEqual(['github']);
    });

    it('should still parse a fully-populated GitHub profile', () => {
        const serverProfile = {
            id: 'user_456',
            timestamp: 1700000001,
            firstName: null,
            lastName: null,
            avatar: null,
            github: {
                id: 7,
                login: 'grace',
                name: 'Grace Hopper',
                avatar_url: 'https://avatars.githubusercontent.com/u/7',
                email: 'grace@example.com',
                bio: 'compiler',
            },
            connectedServices: [],
        };

        const parsed = profileParse(serverProfile);

        expect(parsed.github?.name).toBe('Grace Hopper');
        expect(parsed.github?.email).toBe('grace@example.com');
    });
});
