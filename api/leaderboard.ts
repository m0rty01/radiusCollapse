import { kv } from '@vercel/kv';

const KV_KEY = 'global-leaderboard';
const MAX_ENTRIES = 20;

export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    try {
        // Basic check for KV configuration
        if (!process.env.KV_REST_API_URL) {
            return new Response(JSON.stringify({
                error: 'Vercel KV is not configured. Please ensure you have created and linked a KV database in the Vercel Storage tab.',
                config: 'INTERNAL_MISSING_ENV'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

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
