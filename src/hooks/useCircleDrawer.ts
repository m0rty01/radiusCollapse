import { useState, useEffect, useCallback, useRef } from 'react';
import type { Map, MapMouseEvent, MapTouchEvent, GeoJSONSource } from 'mapbox-gl';
import circle from '@turf/circle';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import destination from '@turf/destination';

type InteractionMode = 'NONE' | 'DRAWING' | 'MOVING' | 'RESIZING';

export const useCircleDrawer = (map: Map | null) => {
    const [center, setCenter] = useState<[number, number] | null>(null);
    const [radius, setRadius] = useState(0); // in meters
    const [activeMode, setActiveMode] = useState<InteractionMode>('NONE');

    const centerRef = useRef<[number, number] | null>(null);
    const radiusRef = useRef(0);
    const isInteractingRef = useRef(false);
    const startPosRef = useRef<{ x: number, y: number } | null>(null);

    const updateCircleDisplay = useCallback((cntr: [number, number], rdsMeters: number) => {
        if (!map) return;

        const safeRadius = Math.max(rdsMeters, 100);
        const options = { steps: 64, units: 'meters' as const };
        const circleData = circle(cntr, safeRadius, options);

        // Center handle point
        const centerPoint = point(cntr);

        // Perimeter handle point (placed at the East edge of the circle)
        const eastPoint = destination(point(cntr), safeRadius, 90, { units: 'meters' });

        // Circle Source/Layers
        const circleSource = map.getSource('guess-circle') as GeoJSONSource;
        if (circleSource) {
            circleSource.setData(circleData);
        } else {
            map.addSource('guess-circle', { type: 'geojson', data: circleData });
            map.addLayer({
                id: 'guess-circle-fill',
                type: 'fill',
                source: 'guess-circle',
                paint: {
                    'fill-color': 'hsl(185, 90%, 50%)',
                    'fill-opacity': 0.15
                }
            });
            map.addLayer({
                id: 'guess-circle-outline',
                type: 'line',
                source: 'guess-circle',
                paint: {
                    'line-color': 'hsl(185, 90%, 50%)',
                    'line-width': 2,
                    'line-dasharray': [3, 2]
                }
            });
        }

        // Handle Source (Unified for both center and perimeter)
        const handleSource = map.getSource('circle-handles') as GeoJSONSource;
        const handlesData = {
            type: 'FeatureCollection',
            features: [
                { ...centerPoint, properties: { type: 'center' } },
                { ...eastPoint, properties: { type: 'perimeter' } }
            ]
        };

        if (handleSource) {
            handleSource.setData(handlesData as any);
        } else {
            map.addSource('circle-handles', { type: 'geojson', data: handlesData as any });
            map.addLayer({
                id: 'circle-handle-layer',
                type: 'circle',
                source: 'circle-handles',
                paint: {
                    'circle-radius': 10,
                    'circle-color': ['match', ['get', 'type'], 'center', '#fff', 'hsl(185, 90%, 50%)'],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });
        }
    }, [map]);

    const reset = useCallback(() => {
        setActiveMode('NONE');
        setCenter(null);
        centerRef.current = null;
        setRadius(0);
        radiusRef.current = 0;

        if (map) {
            ['guess-circle-fill', 'guess-circle-outline', 'circle-handle-layer'].forEach(l => {
                if (map.getLayer(l)) map.removeLayer(l);
            });
            ['guess-circle', 'circle-handles'].forEach(s => {
                if (map.getSource(s)) map.removeSource(s);
            });
        }
    }, [map]);

    useEffect(() => {
        if (!map) return;

        map.boxZoom.disable();

        const getEventData = (e: MapMouseEvent | MapTouchEvent) => {
            const point = 'point' in e ? (e as MapMouseEvent).point : (e as MapTouchEvent).points[0];
            const lngLat = 'lngLat' in e ? (e as MapMouseEvent).lngLat : (e as MapTouchEvent).lngLats[0];
            const originalEvent = e.originalEvent;
            return { point, lngLat, originalEvent };
        };

        const onStart = (e: MapMouseEvent | MapTouchEvent) => {
            const { point, lngLat, originalEvent } = getEventData(e);

            // Only left mouse or touch
            if ('button' in originalEvent && originalEvent.button !== 0) return;

            isInteractingRef.current = true;
            startPosRef.current = { x: point.x, y: point.y };

            const features = map.queryRenderedFeatures(point, { layers: ['circle-handle-layer'] });

            if (features.length > 0) {
                const type = features[0].properties?.type;
                if (type === 'center') {
                    setActiveMode('MOVING');
                } else if (type === 'perimeter') {
                    setActiveMode('RESIZING');
                }
                map.dragPan.disable();
            } else if ((originalEvent as MouseEvent).shiftKey) {
                const coords: [number, number] = [lngLat.lng, lngLat.lat];
                setActiveMode('DRAWING');
                setCenter(coords);
                centerRef.current = coords;
                setRadius(0);
                radiusRef.current = 0;
                map.dragPan.disable();
            }
        };

        const onMove = (e: MapMouseEvent | MapTouchEvent) => {
            const { point: p, lngLat } = getEventData(e);

            // Cursor styling for desktop
            if (activeMode === 'NONE') {
                const features = map.queryRenderedFeatures(p, { layers: ['circle-handle-layer'] });
                map.getCanvas().style.cursor = features.length > 0 ? 'move' : '';
            }

            if (!isInteractingRef.current) return;

            const currentLngLat: [number, number] = [lngLat.lng, lngLat.lat];

            if (activeMode === 'DRAWING' && centerRef.current) {
                const dist = distance(point(centerRef.current), point(currentLngLat), { units: 'meters' });
                const cappedDist = Math.max(dist, 100);
                setRadius(cappedDist);
                radiusRef.current = cappedDist;
                updateCircleDisplay(centerRef.current, cappedDist);
            } else if (activeMode === 'MOVING') {
                setCenter(currentLngLat);
                centerRef.current = currentLngLat;
                updateCircleDisplay(currentLngLat, radiusRef.current);
            } else if (activeMode === 'RESIZING' && centerRef.current) {
                const dist = distance(point(centerRef.current), point(currentLngLat), { units: 'meters' });
                const cappedDist = Math.max(dist, 100);
                setRadius(cappedDist);
                radiusRef.current = cappedDist;
                updateCircleDisplay(centerRef.current, cappedDist);
            }
        };

        const onEnd = (e: MapMouseEvent | MapTouchEvent) => {
            const { point: p, lngLat } = getEventData(e);
            const wasInteracting = isInteractingRef.current;
            const startPos = startPosRef.current;

            isInteractingRef.current = false;
            startPosRef.current = null;

            // Click fallback
            if (wasInteracting && startPos && activeMode === 'NONE') {
                const distMoved = Math.sqrt(Math.pow(p.x - startPos.x, 2) + Math.pow(p.y - startPos.y, 2));
                if (distMoved < 10) { // Slightly larger threshold for touch
                    const coords: [number, number] = [lngLat.lng, lngLat.lat];
                    setCenter(coords);
                    centerRef.current = coords;
                    const newRadius = radiusRef.current > 0 ? radiusRef.current : 500000;
                    setRadius(newRadius);
                    radiusRef.current = newRadius;
                    updateCircleDisplay(coords, newRadius);
                }
            }

            setActiveMode('NONE');
            map.dragPan.enable();
        };

        map.on('mousedown', onStart);
        map.on('mousemove', onMove);
        map.on('mouseup', onEnd);

        map.on('touchstart', onStart);
        map.on('touchmove', onMove);
        map.on('touchend', onEnd);

        return () => {
            map.off('mousedown', onStart);
            map.off('mousemove', onMove);
            map.off('mouseup', onEnd);

            map.off('touchstart', onStart);
            map.off('touchmove', onMove);
            map.off('touchend', onEnd);
        };
    }, [map, activeMode, updateCircleDisplay]);

    return { radius, isDrawing: activeMode !== 'NONE', center, reset };
};

export default useCircleDrawer;
