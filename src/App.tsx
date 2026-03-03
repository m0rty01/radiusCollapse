import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import MapContainer, { type MapContainerHandle } from './components/MapContainer';
import StreetViewPanel from './components/StreetViewPanel';
import Timer from './components/Timer';
import GameOver from './components/GameOver';
import Leaderboard from './components/Leaderboard';
import useCircleDrawer from './hooks/useCircleDrawer';
import { calculateScore, formatDistance } from './utils/scoring';
import { getRandomLocations, type GameLocation } from './utils/locations';
import { saveScore, type RoundResult } from './utils/leaderboard';
import './index.css';

type GamePhase = 'IDLE' | 'STREETVIEW' | 'DRAWING' | 'RESULT' | 'GAMEOVER' | 'LEADERBOARD';

const ROUNDS_PER_GAME = 5;
const STREETVIEW_DURATION = 30; // seconds

function App() {
  const [phase, setPhase] = useState<GamePhase>('IDLE');

  // Supress non-fatal console noise from ad-blockers blocking telemetry
  useEffect(() => {
    const telemetryPatterns = [
      'events.mapbox.com',
      'QuotaService',
      'RecordEvent',
      'gen_204',
      'google-analytics',
      'stats.g.doubleclick.net',
      'AuthenticationService'
    ];

    const isTrackingUrl = (url: string | null | undefined) => {
      if (!url) return false;
      const urlStr = url.toString().toLowerCase();
      return telemetryPatterns.some(p => urlStr.includes(p.toLowerCase()));
    };

    // 1. Fetch Interceptor
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url || '';
      if (isTrackingUrl(url)) {
        return Promise.resolve(new Response(null, { status: 204, statusText: 'Suppressed' }));
      }
      return originalFetch.apply(this, args);
    };

    // 2. XMLHttpRequest Prototype Interceptor
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (_method: string, url: string | URL) {
      (this as any)._isTelemetry = isTrackingUrl(url.toString());
      return originalXHROpen.apply(this, arguments as any);
    };
    XMLHttpRequest.prototype.send = function () {
      if ((this as any)._isTelemetry) return;
      return originalXHRSend.apply(this, arguments as any);
    };

    // 3. Beacon Interceptor
    if (navigator.sendBeacon) {
      const originalBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function (url, _data) {
        if (typeof url === 'string' && isTrackingUrl(url)) return true;
        return originalBeacon.apply(this, arguments as any);
      };
    }

    // 4. DOM Injection Interceptor (Prevents <img> and <script> tracking)
    const originalCreateElement = document.createElement;
    document.createElement = function (tagName: string, options?: ElementCreationOptions) {
      const el = originalCreateElement.call(document, tagName, options);
      const tag = tagName.toLowerCase();
      if (tag === 'img' || tag === 'script') {
        Object.defineProperty(el, 'src', {
          set(value) {
            if (isTrackingUrl(value)) return;
            this.setAttribute('src', value);
          },
          get() { return this.getAttribute('src'); }
        });
      }
      return el;
    };

    // 5. Image Constructor Hook
    const originalImage = window.Image;
    (window as any).Image = function () {
      const img = new originalImage();
      Object.defineProperty(img, 'src', {
        set(value) {
          if (isTrackingUrl(value)) return;
          img.setAttribute('src', value);
        },
        get() { return img.getAttribute('src'); }
      });
      return img;
    };

    // 6. Aggressive Console Hijacking
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      const msg = args.join(' ').toLowerCase();
      if (msg.includes('mapbox') || msg.includes('google') || msg.includes('fetch') || msg.includes('blocked') || msg.includes('quota')) {
        return;
      }
      originalError.apply(console, args);
    };

    console.warn = (...args) => {
      const msg = args.join(' ').toLowerCase();
      if (msg.includes('google maps') || msg.includes('async')) return;
      originalWarn.apply(console, args);
    };

    // 7. Global Rejection/Error Suppression
    const handleSuppression = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message = (event as any).message || (event as any).reason?.message || '';
      const stack = (event as any).error?.stack || (event as any).reason?.stack || '';
      const url = (event as any).reason?.url || '';

      const isTelemetry = message.toLowerCase().includes('fetch') ||
        message.toLowerCase().includes('blocked') ||
        stack.includes('mapbox') ||
        stack.includes('google') ||
        url.includes('googleapis') ||
        url.includes('mapbox');

      if (isTelemetry) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener('error', handleSuppression, true);
    window.addEventListener('unhandledrejection', handleSuppression, true);

    return () => {
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
      document.createElement = originalCreateElement;
      (window as any).Image = originalImage;
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('error', handleSuppression, true);
      window.removeEventListener('unhandledrejection', handleSuppression, true);
    };
  }, []);
  const [round, setRound] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [currentRoundScore, setCurrentRoundScore] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [submittedScore, setSubmittedScore] = useState<number | undefined>(undefined);

  const mapContainerRef = useRef<MapContainerHandle>(null);
  const { radius, isDrawing, center, reset: resetCircle } = useCircleDrawer(mapInstance);

  const currentLocation = useMemo(() => locations[round], [locations, round]);

  /* ---- Game Flow ---- */

  const startGame = () => {
    const locs = getRandomLocations(ROUNDS_PER_GAME);
    setLocations(locs);
    setRound(0);
    setTotalScore(0);
    setCurrentRoundScore(0);
    setRoundResults([]);
    setSubmittedScore(undefined);
    setPhase('STREETVIEW');
  };

  const handleTimerExpire = () => {
    setPhase('DRAWING');
  };

  const handleMapLoad = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map);
  }, []);

  const handleLockGuess = () => {
    if (!center || radius === 0 || !currentLocation) return;

    const roundScore = calculateScore(radius, center, currentLocation.lngLat);
    const hit = roundScore > 0;
    setCurrentRoundScore(roundScore);
    setTotalScore((prev) => prev + roundScore);

    const result: RoundResult = {
      locationName: `${currentLocation.name}, ${currentLocation.country}`,
      score: roundScore,
      radiusKm: Math.round(radius / 100) / 10, // 1 decimal
      hit,
    };
    setRoundResults((prev) => [...prev, result]);

    // Show target on map
    if (mapInstance) {
      const targetData: GeoJSON.Geometry = {
        type: 'Point',
        coordinates: currentLocation.lngLat,
      };

      const source = mapInstance.getSource('target-point') as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData(targetData);
      } else {
        mapInstance.addSource('target-point', { type: 'geojson', data: targetData });
        mapInstance.addLayer({
          id: 'target-point-layer',
          type: 'circle',
          source: 'target-point',
          paint: {
            'circle-color': hit ? '#00e676' : '#ff1744',
            'circle-radius': 10,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#fff',
          },
        });
      }

      // Zoom to show both
      const bounds = new mapboxgl.LngLatBounds().extend(center).extend(currentLocation.lngLat);
      mapInstance.fitBounds(bounds, { padding: 120, duration: 1500 });
    }

    setPhase('RESULT');
  };

  const nextRound = () => {
    if (round + 1 >= ROUNDS_PER_GAME) {
      setPhase('GAMEOVER');
      return;
    }

    // Clean up map
    mapContainerRef.current?.reset();
    resetCircle();

    setRound((prev) => prev + 1);
    setCurrentRoundScore(0);
    setPhase('STREETVIEW');
  };

  const handleSubmitUsername = async (username: string) => {
    await saveScore({
      username,
      score: totalScore,
      date: new Date().toISOString(),
      rounds: roundResults,
    });
    setSubmittedScore(totalScore);
    setPhase('LEADERBOARD');
  };

  const handlePlayAgain = () => {
    mapContainerRef.current?.reset();
    resetCircle();
    setPhase('IDLE');
  };

  /* ---- Render ---- */

  return (
    <div className="game-container">
      {/* ---- IDLE / Splash ---- */}
      {phase === 'IDLE' && (
        <div className="splash-screen glass">
          <h1 className="title-gradient">Radius Collapse</h1>
          <p className="splash-tagline">
            Explore. Guess. Collapse the radius.
          </p>
          <div className="splash-rules">
            <div className="rule-item">🌍 <span>Explore a random street view</span></div>
            <div className="rule-item">⏱️ <span>Before the timer runs out</span></div>
            <div className="rule-item">🎯 <span>Draw a circle on the map</span></div>
            <div className="rule-item">📏 <span>Smaller circle = more points</span></div>
          </div>
          <button className="btn-primary btn-large" onClick={startGame}>
            Start Mission
          </button>
          <button className="btn-ghost" onClick={() => setPhase('LEADERBOARD')}>
            View Leaderboard
          </button>
        </div>
      )}

      {/* ---- STREET VIEW Phase ---- */}
      {phase === 'STREETVIEW' && currentLocation && (
        <div className="phase-streetview">
          <StreetViewPanel
            location={currentLocation}
            onError={() => {
              // Automatically replace the failing location for this round
              setLocations(prev => {
                const next = [...prev];
                next[round] = getRandomLocations(1)[0];
                return next;
              });
            }}
          />
          <div className="sv-hud">
            <div className="hud-top glass">
              <div className="stat">
                <span className="label">ROUND</span>
                <span className="value text-accent">{round + 1}/{ROUNDS_PER_GAME}</span>
              </div>
              <div className="stat">
                <span className="label">SCORE</span>
                <span className="value">{totalScore}</span>
              </div>
            </div>
            <div className="timer-wrapper">
              <Timer duration={STREETVIEW_DURATION} onExpire={handleTimerExpire} />
            </div>
            <div className="hud-bottom glass">
              <p className="instruction">🔍 Look around and memorize clues. Where in the world are you?</p>
              <button className="btn-primary" onClick={handleTimerExpire}>
                I'm Ready
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- DRAWING Phase ---- */}
      {phase === 'DRAWING' && (
        <div className="phase-drawing">
          <MapContainer ref={mapContainerRef} onMapLoad={handleMapLoad} />
          <div className="hud-overlay">
            <div className="hud-top glass">
              <div className="stat">
                <span className="label">ROUND</span>
                <span className="value text-accent">{round + 1}/{ROUNDS_PER_GAME}</span>
              </div>
              <div className="stat">
                <span className="label">SCORE</span>
                <span className="value">{totalScore}</span>
              </div>
            </div>

            <div className="hud-center">
              {radius > 0 && (
                <div className="radius-indicator glass animate-pop">
                  <span className="label">ESTIMATED RADIUS</span>
                  <span className="value">{formatDistance(radius)}</span>
                </div>
              )}
            </div>

            <div className="instructions-panel glass animate-slide-right">
              <h3>Map Controls</h3>
              <ul className="control-list">
                <li><span>🖱️ <strong>Pan</strong></span> <span>Drag map</span></li>
                <li><span>🎯 <strong>Place</strong></span> <span>Click map</span></li>
                <li><span>⌨️ <strong>Draw</strong></span> <span>Shift + Drag</span></li>
                <li><span>🎯 <strong>Move</strong></span> <span>Drag handle</span></li>
              </ul>
            </div>

            <div className="hud-bottom glass animate-slide-up">
              {!center ? (
                <p className="instruction">🎯 <strong>Click</strong> to place or <strong>Shift+Drag</strong> to draw</p>
              ) : (
                <div className="action-row">
                  <p className="instruction">{isDrawing ? 'Resizing...' : 'Adjust circle or lock mission'}</p>
                  {!isDrawing && radius > 0 && (
                    <button className="btn-primary" onClick={handleLockGuess}>
                      Lock Guess
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- RESULT Phase ---- */}
      {phase === 'RESULT' && (
        <div className="phase-drawing">
          <MapContainer ref={mapContainerRef} onMapLoad={handleMapLoad} />
          <div className="result-overlay">
            <div className="result-card glass animate-pop">
              <h2>{currentRoundScore > 0 ? '✅ Target Contained!' : '❌ Target Missed!'}</h2>
              <div className="big-score">{currentRoundScore > 0 ? `+${currentRoundScore}` : '0'}</div>
              <p>
                The target was in <strong>{currentLocation?.name}, {currentLocation?.country}</strong>
              </p>
              {radius > 0 && (
                <p className="result-radius">Your radius: {formatDistance(radius)}</p>
              )}
              <button className="btn-primary" onClick={nextRound}>
                {round + 1 < ROUNDS_PER_GAME ? 'Next Round →' : 'View Results'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- GAME OVER ---- */}
      {phase === 'GAMEOVER' && (
        <GameOver
          totalScore={totalScore}
          rounds={roundResults}
          onSubmit={handleSubmitUsername}
        />
      )}

      {/* ---- LEADERBOARD ---- */}
      {phase === 'LEADERBOARD' && (
        <Leaderboard
          currentScore={submittedScore}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}

export default App;
