import React from 'react';
import { getLeaderboard, type LeaderboardEntry } from '../utils/leaderboard';

interface LeaderboardProps {
    currentScore?: number;
    onPlayAgain: () => void;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ currentScore, onPlayAgain }) => {
    const entries: LeaderboardEntry[] = getLeaderboard();

    return (
        <div className="leaderboard-overlay">
            <div className="leaderboard-card glass animate-pop">
                <h2 className="title-gradient">🏆 Leaderboard</h2>

                {entries.length === 0 ? (
                    <p className="leaderboard-empty">No scores yet. Be the first!</p>
                ) : (
                    <div className="leaderboard-table-wrapper">
                        <table className="leaderboard-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Player</th>
                                    <th>Score</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry, i) => (
                                    <tr
                                        key={i}
                                        className={
                                            currentScore !== undefined && entry.score === currentScore
                                                ? 'highlight-row'
                                                : ''
                                        }
                                    >
                                        <td className="rank">
                                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                        </td>
                                        <td className="player-name">{entry.username}</td>
                                        <td className="player-score">{entry.score.toLocaleString()}</td>
                                        <td className="player-date">
                                            {new Date(entry.date).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <button className="btn-primary" onClick={onPlayAgain}>
                    Play Again
                </button>
            </div>
        </div>
    );
};

export default Leaderboard;
