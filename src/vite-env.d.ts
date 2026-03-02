/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_MAPBOX_ACCESS_TOKEN: string;
    readonly VITE_GOOGLE_MAPS_API_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Minimal Google Maps type declarations for Street View
declare namespace google.maps {
    class StreetViewPanorama {
        constructor(container: HTMLElement, opts?: StreetViewPanoramaOptions);
        getStatus(): StreetViewStatus;
        setVisible(visible: boolean): void;
        addListener(event: string, handler: () => void): void;
    }

    interface StreetViewPanoramaOptions {
        position?: { lat: number; lng: number };
        pano?: string;
        pov?: { heading: number; pitch: number };
        zoom?: number;
        addressControl?: boolean;
        showRoadLabels?: boolean;
        linksControl?: boolean;
        panControl?: boolean;
        zoomControl?: boolean;
        fullscreenControl?: boolean;
        motionTracking?: boolean;
        motionTrackingControl?: boolean;
    }

    class StreetViewService {
        getPanorama(
            request: StreetViewLocationRequest,
            callback: (data: StreetViewPanoramaData | null, status: StreetViewStatus) => void
        ): void;
    }

    interface StreetViewLocationRequest {
        location: { lat: number; lng: number };
        radius?: number;
        source?: string;
    }

    interface StreetViewPanoramaData {
        location: {
            pano: string;
            description?: string;
            latLng: any;
        };
    }

    enum StreetViewStatus {
        OK = 'OK',
        UNKNOWN_ERROR = 'UNKNOWN_ERROR',
        ZERO_RESULTS = 'ZERO_RESULTS',
        REQUEST_DENIED = 'REQUEST_DENIED',
        OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
    }
}

interface Window {
    google?: {
        maps?: typeof google.maps & {
            StreetViewPanorama: typeof google.maps.StreetViewPanorama;
            StreetViewService: typeof google.maps.StreetViewService;
            StreetViewStatus: typeof google.maps.StreetViewStatus;
        };
    };
}
