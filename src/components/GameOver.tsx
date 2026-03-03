import React, { useState } from 'react';
import type { RoundResult } from '../utils/leaderboard';

interface GameOverProps {
    totalScore: number;
    rounds: RoundResult[];
    onSubmit: (username: string) => void;
}

const GameOver: React.FC<GameOverProps> = ({ totalScore, rounds, onSubmit }) => {
    const [username, setUsername] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        const name = username.trim() || 'Anonymous';
        await onSubmit(name);
        // Phase transition happens in parent (App.tsx)
    };

    return (
        <div className="gameover-overlay">
            <div className="gameover-card glass animate-pop">
                <h1 className="title-gradient">Game Over</h1>
                <div className="gameover-score">{totalScore}</div>
                <p className="gameover-subtitle">Total Points</p>

                <div className="rounds-breakdown">
                    {rounds.map((r, i) => (
                        <div key={i} className="round-row">
                            <span className="round-num">R{i + 1}</span>
                            <span className="round-location">{r.locationName}</span>
                            <span className={`round-result ${r.hit ? 'hit' : 'miss'}`}>
                                {r.hit ? `+${r.score}` : 'Miss'}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="username-section">
                    <label htmlFor="username-input">Enter your username</label>
                    <input
                        id="username-input"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Anonymous"
                        maxLength={20}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        disabled={isSubmitting}
                    />
                </div>

                <button
                    className="btn-primary"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? <><div className="spinner-small" /> Submitting...</> : 'Submit to Leaderboard'}
                </button>
            </div>
        </div>
    );
};

export default GameOver;
