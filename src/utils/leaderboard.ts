/**
 * Global leaderboard backed by Vercel KV (Redis).
 */

export interface RoundResult {
    locationName: string;
    score: number;
    radiusKm: number;
    hit: boolean;
}

export interface LeaderboardEntry {
    username: string;
    score: number;
    date: string;
    rounds: RoundResult[];
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
        const response = await fetch('/api/leaderboard');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch leaderboard: ${errorText}`);
        }

        const data = await response.json();

        // Members are stored as JSON strings in the Redis Sorted Set
        return data.map((item: any) => {
            if (typeof item === 'string') {
                try {
                    return JSON.parse(item);
                } catch {
                    return item;
                }
            }
            return item;
        });
    } catch (error) {
        console.error('Leaderboard Fetch Error:', error);
        return [];
    }
}

export async function saveScore(entry: LeaderboardEntry): Promise<boolean> {
    try {
        const response = await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
        });
        return response.ok;
    } catch (error) {
        console.error('Leaderboard Save Error:', error);
        return false;
    }
}

export function clearLeaderboard(): void {
    // Note: Global clear is usually restricted.
    console.warn('Manual clear of global leaderboard is not implemented for security.');
}
