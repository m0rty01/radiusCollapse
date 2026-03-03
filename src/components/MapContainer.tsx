import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export interface MapContainerHandle {
    getMap: () => mapboxgl.Map | null;
    reset: () => void;
}

interface MapContainerProps {
    onMapLoad?: (map: mapboxgl.Map) => void;
}

const MapContainer = forwardRef<MapContainerHandle, MapContainerProps>(({ onMapLoad }, ref) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const mapLoadedRef = useRef(false);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
        getMap: () => mapRef.current,
        reset: () => {
            const map = mapRef.current;
            if (!map) return;
            // Remove guess circle layers
            ['guess-circle-fill', 'guess-circle-outline'].forEach((id) => {
                if (map.getLayer(id)) map.removeLayer(id);
            });
            if (map.getSource('guess-circle')) map.removeSource('guess-circle');
            // Remove target point
            if (map.getLayer('target-point-layer')) map.removeLayer('target-point-layer');
            if (map.getSource('target-point')) map.removeSource('target-point');
            // Reset view
            map.flyTo({ zoom: 2, center: [0, 20], duration: 1000 });
        },
    }));

    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        try {
            if (!mapboxgl.supported()) {
                setError('Your browser does not support WebGL.');
                return;
            }

            const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
            if (!token) {
                setError('Mapbox Access Token is missing.');
                return;
            }

            mapboxgl.accessToken = token;

            const map = new mapboxgl.Map({
                container: mapContainerRef.current,
                style: 'mapbox://styles/mapbox/dark-v11',
                center: [0, 20],
                zoom: 2,
                projection: { name: 'mercator' },
                // Minimize telemetry/noise that gets blocked by adblockers
                trackResize: false, // We'll manage resize manually to avoid noise
                collectResourceTiming: false,
            });

            // Re-enable resize handling manually
            const resizeObserver = new ResizeObserver(() => map.resize());
            resizeObserver.observe(mapContainerRef.current);

            mapRef.current = map;

            map.on('load', () => {
                mapLoadedRef.current = true;
                console.log('Map loaded successfully');
                if (onMapLoad) onMapLoad(map);
            });

            map.on('error', (e) => {
                const errorData = (e as any).error;
                if (!mapLoadedRef.current && errorData?.status === 401) {
                    setError('Invalid Mapbox Token (401).');
                }
                if (errorData?.status === 403) {
                    console.warn('[Mapbox] Non-fatal 403 on tile.');
                }
            });
        } catch {
            setError('Failed to initialize map engine.');
        }

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [onMapLoad]);

    if (error) {
        return (
            <div className="map-error-state glass">
                <h3>Map Error</h3>
                <p>{error}</p>
                <button className="btn-primary" onClick={() => window.location.reload()}>Retry</button>
            </div>
        );
    }

    return (
        <div className="map-container-outer">
            <div ref={mapContainerRef} className="map-canvas" />
        </div>
    );
});

MapContainer.displayName = 'MapContainer';
export default MapContainer;
