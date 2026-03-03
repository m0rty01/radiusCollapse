import { createClient } from '@vercel/kv';

const KV_KEY = 'global-leaderboard';
const MAX_ENTRIES = 20;

export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    try {
        // Robust auto-discovery: Look for any env vars ending in the required suffixes
        // This handles cases where prefixes like "kv_", "UPSTASH_", or "KV_" are used/doubled
        const findEnv = (suffix: string) =>
            Object.entries(process.env).find(([k]) => k.toUpperCase().endsWith(suffix))?.[1];

        const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || findEnv('REST_API_URL');
        const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || findEnv('REST_API_TOKEN');

        if (!url || !token) {
            const keys = Object.keys(process.env).filter(k => k.includes('KV') || k.includes('REDIS') || k.includes('UPSTASH'));
            return new Response(JSON.stringify({
                error: 'Database credentials not found.',
                foundKeys: keys,
                fix: 'The API expects variables ending in REST_API_URL and REST_API_TOKEN.'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Initialize client manually
        const kv = createClient({ url, token });
        const { method } = request;

        if (method === 'GET') {
            // Fetch top 20 entries using zrange with rev: true
            const entries = await kv.zrange(KV_KEY, 0, MAX_ENTRIES - 1, { rev: true });
            return new Response(JSON.stringify(entries || []), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (method === 'POST') {
            const entry = await request.json();
            if (!entry.username || typeof entry.score !== 'number') {
                return new Response('Invalid entry', { status: 400 });
            }

            // We add the entry as a JSON string to the sorted set
            // The score is the ranking criteria
            const entryString = JSON.stringify(entry);
            await kv.zadd(KV_KEY, { score: entry.score, member: entryString });

            // Trim to top 20 to keep storage clean
            await kv.zremrangebyrank(KV_KEY, 0, -(MAX_ENTRIES + 1));

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response('Method not allowed', { status: 405 });
    } catch (error: any) {
        console.error('Leaderboard API Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
