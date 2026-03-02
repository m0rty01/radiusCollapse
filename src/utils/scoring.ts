import { point, booleanPointInPolygon, circle } from '@turf/turf';

/**
 * Calculates the score for a guess.
 * @param radius Meters
 * @param center [lng, lat]
 * @param target [lng, lat]
 * @returns Score between 0 and 5000
 */
export const calculateScore = (
    radius: number,
    center: [number, number],
    target: [number, number]
): number => {
    // 1. Check if target is inside the circle
    const targetPoint = point(target);
    const guessCircle = circle(center, radius, { units: 'meters' });

    const isInside = booleanPointInPolygon(targetPoint, guessCircle);

    if (!isInside) return 0;

    // 2. Continuous scoring based on area/radius
    // Score = 5000 * exp(- (radius / 200000)^0.8)
    // This gives:
    // 100m   -> 4990
    // 10km   -> 4400
    // 100km  -> 2500
    // 500km  -> 700
    // 1000km -> 300

    const radiusKm = radius / 1000;
    const score = 5000 * Math.exp(-Math.pow(radiusKm / 150, 0.7));

    return Math.round(score);
};

export const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
};
