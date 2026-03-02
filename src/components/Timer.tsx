import React, { useState, useEffect, useRef } from 'react';

interface TimerProps {
    duration: number; // seconds
    onExpire: () => void;
    paused?: boolean;
}

const Timer: React.FC<TimerProps> = ({ duration, onExpire, paused = false }) => {
    const [remaining, setRemaining] = useState(duration);
    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    // Reset timer when duration changes (e.g., new round)
    useEffect(() => {
        setRemaining(duration);
    }, [duration]);

    // Handle countdown
    useEffect(() => {
        if (paused || remaining <= 0) return;

        const interval = setInterval(() => {
            setRemaining((prev) => Math.max(0, prev - 1));
        }, 1000);

        return () => clearInterval(interval);
    }, [paused, remaining > 0]);

    // Handle expiration in a separate effect to avoid state-update-during-render warnings
    useEffect(() => {
        if (remaining === 0 && !paused) {
            onExpireRef.current();
        }
    }, [remaining, paused]);

    const progress = remaining / duration;
    const isUrgent = remaining <= 10;
    const circumference = 2 * Math.PI * 44;
    const offset = circumference * (1 - progress);

    const formatTime = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}`;
    };

    return (
        <div className={`timer-container ${isUrgent ? 'timer-urgent' : ''}`}>
            <svg className="timer-ring" viewBox="0 0 100 100">
                <circle
                    className="timer-ring-bg"
                    cx="50" cy="50" r="44"
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="4"
                />
                <circle
                    className="timer-ring-progress"
                    cx="50" cy="50" r="44"
                    fill="none"
                    stroke={isUrgent ? 'hsl(0, 80%, 60%)' : 'hsl(185, 90%, 50%)'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform="rotate(-90 50 50)"
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
                />
            </svg>
            <span className="timer-text">{formatTime(remaining)}</span>
        </div>
    );
};

export default Timer;
