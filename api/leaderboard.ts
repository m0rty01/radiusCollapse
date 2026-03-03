import { createClient } from '@vercel/kv';

const KV_KEY = 'global-leaderboard';
const MAX_ENTRIES = 20;

export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    try {
        // Robust auto-discovery: Scan all env vars for Redis/KV credentials
        let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
        let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

        // Fallback for custom prefixes (like kv_KV_...)
        // Edge runtime process.env is sometimes a proxy, so we iterate manually
        if (!url || !token) {
            for (const key in process.env) {
                const k = key.toUpperCase();
                const value = process.env[key];
                if (k.endsWith('REST_API_URL')) url = value;
                if (k.endsWith('REST_API_TOKEN') && !k.includes('READ_ONLY')) token = value;
            }
        }

        if (!url || !token) {
            return new Response(JSON.stringify({
                error: 'Database connection failed. Please ensure Vercel KV or Redis is correctly linked in your project settings.'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

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
