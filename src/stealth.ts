/**
 * ULTRA STEALTH ENGINE
 * Silences telemetry, security intrinsics, and extension-driven console noise
 * This should be imported as the first line in main.tsx
 */

const telemetryPatterns = [
    'events.mapbox.com',
    'QuotaService',
    'RecordEvent',
    'gen_204',
    'google-analytics',
    'stats.g.doubleclick.net',
    'AuthenticationService',
    'chrome-extension://',
    'intrinsics',
    'ses'
];

const isNoiseUrl = (url: string | null | undefined) => {
    if (!url) return false;
    const urlStr = url.toString().toLowerCase();
    return telemetryPatterns.some(p => urlStr.includes(p.toLowerCase()));
};

// 1. Fetch & XHR Interceptors
const originalFetch = window.fetch;
window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url || '';
    if (isNoiseUrl(url)) {
        return Promise.resolve(new Response(null, { status: 204, statusText: 'Suppressed' }));
    }
    return originalFetch.apply(this, args);
};

const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (_method: string, url: string | URL) {
    (this as any)._isTelemetry = isNoiseUrl(url.toString());
    return originalXHROpen.apply(this, arguments as any);
};
XMLHttpRequest.prototype.send = function () {
    if ((this as any)._isTelemetry) return;
    return originalXHRSend.apply(this, arguments as any);
};

// 2. Beacon Interceptor
if (navigator.sendBeacon) {
    const originalBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, _data) {
        if (typeof url === 'string' && isNoiseUrl(url)) return true;
        return originalBeacon.apply(this, arguments as any);
    };
}

// 3. DOM & Image Interceptors (Blocking early extension asset loads)
const originalCreateElement = document.createElement;
document.createElement = function (tagName: string, options?: ElementCreationOptions) {
    const el = originalCreateElement.call(document, tagName, options);
    const tag = tagName.toLowerCase();
    if (tag === 'img' || tag === 'script' || tag === 'link') {
        const prop = tag === 'link' ? 'href' : 'src';
        Object.defineProperty(el, prop, {
            set(value) {
                if (isNoiseUrl(value)) return;
                this.setAttribute(prop, value);
            },
            get() { return this.getAttribute(prop); }
        });
    }
    return el;
};

const originalImage = window.Image;
(window as any).Image = function () {
    const img = new originalImage();
    Object.defineProperty(img, 'src', {
        set(value) {
            if (isNoiseUrl(value)) return;
            img.setAttribute('src', value);
        },
        get() { return img.getAttribute('src'); }
    });
    return img;
};

// 4. Aggressive Console Hijacking
const logLevels = ['log', 'info', 'warn', 'error', 'debug'];
logLevels.forEach(level => {
    const original = (console as any)[level];
    (console as any)[level] = (...args: any[]) => {
        const msg = args.join(' ').toLowerCase();
        if (isNoiseUrl(msg) ||
            msg.includes('mapbox') ||
            msg.includes('google') ||
            msg.includes('streetview') ||
            msg.includes('frame_start') ||
            msg.includes('removechild') ||
            msg.includes('net::err_file_not_found') ||
            msg.includes('intrinsics') ||
            msg.includes('ses')) {
            return;
        }
        original.apply(console, args);
    };
});

// 5. Global Error & Rejection Hijacking
const handleSuppression = (event: ErrorEvent | PromiseRejectionEvent) => {
    const message = (event as any).message || (event as any).reason?.message || '';
    const stack = (event as any).error?.stack || (event as any).reason?.stack || '';
    const url = (event as any).reason?.url || (event as any).filename || '';
    const fullMsg = (message + ' ' + stack + ' ' + url).toLowerCase();

    if (isNoiseUrl(fullMsg) ||
        fullMsg.includes('mapbox') ||
        fullMsg.includes('google') ||
        fullMsg.includes('frame_start') ||
        fullMsg.includes('removechild') ||
        fullMsg.includes('extension')) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }
};

window.addEventListener('error', handleSuppression, true);
window.addEventListener('unhandledrejection', handleSuppression, true);

console.log('🛡️ Stealth engine initialized');
