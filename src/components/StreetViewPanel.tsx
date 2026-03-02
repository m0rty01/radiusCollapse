import React, { useRef, useEffect, useState } from 'react';
import type { GameLocation } from '../utils/locations';

interface StreetViewPanelProps {
    location: GameLocation;
    onReady?: () => void;
    onError?: (status: string) => void;
}

/** Loads the Google Maps JS API via script tag (no npm dependency needed). */
function loadGoogleMapsApi(apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (window.google?.maps?.StreetViewPanorama) {
            resolve();
            return;
        }

        if (document.getElementById('google-maps-script')) {
            const checkReady = setInterval(() => {
                if (window.google?.maps?.StreetViewPanorama) {
                    clearInterval(checkReady);
                    resolve();
                }
            }, 100);
            return;
        }

        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            const checkInit = setInterval(() => {
                if (window.google?.maps) {
                    clearInterval(checkInit);
                    resolve();
                }
            }, 50);
        };
        script.onerror = () => reject(new Error('Failed to load Google Maps API'));
        document.head.appendChild(script);
    });
}

// Global service to prevent multiple instances
let sharedSvService: google.maps.StreetViewService | null = null;

const StreetViewPanel: React.FC<StreetViewPanelProps> = ({ location, onReady, onError }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;

        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
        if (!apiKey) {
            setError('Google Maps API Key is missing.');
            setLoading(false);
            return;
        }

        let cancelled = false;

        // Small delay to prevent rapid-fire requests on round transitions (prevents 429)
        const initTimeout = setTimeout(() => {
            loadGoogleMapsApi(apiKey).then(() => {
                if (cancelled || !containerRef.current) return;

                if (!sharedSvService) {
                    sharedSvService = new google.maps.StreetViewService();
                }

                const pos = { lat: location.lngLat[1], lng: location.lngLat[0] };

                // Search radius increased to 2000m to find nearest imagery for remote spots
                sharedSvService.getPanorama({ location: pos, radius: 2000 }, (data, status) => {
                    if (cancelled || !containerRef.current) return;

                    if (status === 'OK' && data?.location?.pano) {
                        const panorama = new google.maps.StreetViewPanorama(containerRef.current!, {
                            pano: data.location.pano,
                            pov: { heading: location.heading, pitch: location.pitch },
                            zoom: 1,
                            addressControl: false,
                            showRoadLabels: false,
                            linksControl: true,
                            panControl: true,
                            zoomControl: true,
                            fullscreenControl: false,
                        });

                        panoramaRef.current = panorama;
                        setLoading(false);
                        onReady?.();

                        panorama.addListener('status_changed', () => {
                            const pStatus = panorama.getStatus();
                            if (pStatus !== 'OK' && !cancelled) {
                                console.error('[StreetView] status_changed error:', pStatus);
                            }
                        });
                    } else {
                        console.error('[StreetView] getPanorama error:', status);
                        if (status === 'ZERO_RESULTS') {
                            // Automatically notify parent to pick a new location
                            onError?.(status);
                        } else {
                            setError(`Street View not available (Status: ${status}).`);
                            setLoading(false);
                        }
                    }
                });
            }).catch((err) => {
                if (!cancelled) {
                    setError(`Map Error: ${err.message}`);
                    setLoading(false);
                }
            });
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(initTimeout);
            if (panoramaRef.current) {
                (google.maps as any).event?.clearInstanceListeners(panoramaRef.current);
                panoramaRef.current.setVisible(false);
                panoramaRef.current = null;
            }
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [location, retryKey, onError, onReady]);

    return (
        <div className="streetview-container">
            {loading && (
                <div className="streetview-loading">
                    <div className="spinner" />
                    <p>Loading Street View...</p>
                </div>
            )}
            {error && (
                <div className="streetview-error glass">
                    <h3>⚠️ View Error</h3>
                    <p>{error}</p>
                    <button className="btn-ghost" onClick={() => { setError(null); setLoading(true); setRetryKey(k => k + 1); }}>
                        Retry
                    </button>
                </div>
            )}
            <div ref={containerRef} className="streetview-canvas" />
        </div>
    );
};

export default StreetViewPanel;
