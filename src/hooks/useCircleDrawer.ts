import { useState, useEffect, useCallback, useRef } from 'react';
import type { Map, MapMouseEvent, GeoJSONSource } from 'mapbox-gl';
import circle from '@turf/circle';
import distance from '@turf/distance';
import { point } from '@turf/helpers';

type InteractionMode = 'NONE' | 'DRAWING' | 'MOVING';

export const useCircleDrawer = (map: Map | null) => {
    const [center, setCenter] = useState<[number, number] | null>(null);
    const [radius, setRadius] = useState(0); // in meters
    const [activeMode, setActiveMode] = useState<InteractionMode>('NONE');

    const centerRef = useRef<[number, number] | null>(null);
    const radiusRef = useRef(0);
    const isMouseDownRef = useRef(false);
    const startPosRef = useRef<{ x: number, y: number } | null>(null);

    const updateCircleDisplay = useCallback((cntr: [number, number], rdsMeters: number) => {
        if (!map) return;

        // Minimum radius 100m, but if it's very small and just placed, maybe 1km default?
        // We'll use the rdsMeters passed.
        const safeRadius = Math.max(rdsMeters, 100);
        const options = { steps: 64, units: 'meters' as const };
        const circleData = circle(cntr, safeRadius, options);
        const centerPoint = point(cntr);

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

        // Handle Source/Layer
        const handleSource = map.getSource('circle-handle') as GeoJSONSource;
        if (handleSource) {
            handleSource.setData(centerPoint);
        } else {
            map.addSource('circle-handle', { type: 'geojson', data: centerPoint });
            map.addLayer({
                id: 'circle-handle-layer',
                type: 'circle',
                source: 'circle-handle',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#fff',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': 'hsl(185, 90%, 50%)'
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
            ['guess-circle', 'circle-handle'].forEach(s => {
                if (map.getSource(s)) map.removeSource(s);
            });
        }
    }, [map]);

    useEffect(() => {
        if (!map) return;

        // Prevent Mapbox default box zoom to avoid conflict with Shift key
        map.boxZoom.disable();

        const onMouseDown = (e: MapMouseEvent) => {
            if (e.originalEvent.button !== 0) return;
            isMouseDownRef.current = true;
            startPosRef.current = { x: e.point.x, y: e.point.y };

            const features = map.queryRenderedFeatures(e.point, { layers: ['circle-handle-layer'] });

            if (features.length > 0) {
                setActiveMode('MOVING');
                map.dragPan.disable();
            } else if (e.originalEvent.shiftKey) {
                const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
                setActiveMode('DRAWING');
                setCenter(lngLat);
                centerRef.current = lngLat;
                setRadius(0);
                radiusRef.current = 0;
                map.dragPan.disable();
            }
        };

        const onMouseMove = (e: MapMouseEvent) => {
            // Custom cursor for handle
            if (activeMode === 'NONE') {
                const features = map.queryRenderedFeatures(e.point, { layers: ['circle-handle-layer'] });
                map.getCanvas().style.cursor = features.length > 0 ? 'move' : '';
            }

            if (!isMouseDownRef.current) return;

            const currentLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

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
            }
        };

        const onMouseUp = (e: MapMouseEvent) => {
            const wasMouseDown = isMouseDownRef.current;
            const startPos = startPosRef.current;
            isMouseDownRef.current = false;
            startPosRef.current = null;

            // Handle CLICK fallback (no shift, no major drag)
            if (wasMouseDown && startPos && activeMode === 'NONE') {
                const distMoved = Math.sqrt(Math.pow(e.point.x - startPos.x, 2) + Math.pow(e.point.y - startPos.y, 2));
                if (distMoved < 5) {
                    // It was a simple click -> Place or Move circle center here
                    const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
                    setCenter(lngLat);
                    centerRef.current = lngLat;

                    // Use current radius or a 500km default for visibility
                    const newRadius = radiusRef.current > 0 ? radiusRef.current : 500000;
                    setRadius(newRadius);
                    radiusRef.current = newRadius;
                    updateCircleDisplay(lngLat, newRadius);
                }
            }

            setActiveMode('NONE');
            map.dragPan.enable();
        };

        map.on('mousedown', onMouseDown);
        map.on('mousemove', onMouseMove);
        map.on('mouseup', onMouseUp);

        return () => {
            map.off('mousedown', onMouseDown);
            map.off('mousemove', onMouseMove);
            map.off('mouseup', onMouseUp);
        };
    }, [map, activeMode, updateCircleDisplay]);

    return { radius, isDrawing: activeMode !== 'NONE', center, reset };
};

export default useCircleDrawer;
