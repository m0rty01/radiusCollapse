/**
 * localStorage-backed leaderboard for Radius Collapse.
 */

const STORAGE_KEY = 'radius-collapse-leaderboard';
const MAX_ENTRIES = 20;

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

export function getLeaderboard(): LeaderboardEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const entries: LeaderboardEntry[] = JSON.parse(raw);
        return entries.sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
    } catch {
        return [];
    }
}

export function saveScore(entry: LeaderboardEntry): void {
    const current = getLeaderboard();
    current.push(entry);
    current.sort((a, b) => b.score - a.score);
    const trimmed = current.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function clearLeaderboard(): void {
    localStorage.removeItem(STORAGE_KEY);
}
