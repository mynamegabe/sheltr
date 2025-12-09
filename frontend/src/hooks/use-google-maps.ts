import { useState, useEffect } from "react";

const CALLBACK_NAME = "initGoogleMapsConfig";

// Global declaration for TS
declare global {
  interface Window {
    google: any;
    [CALLBACK_NAME]: () => void;
  }
}

export function useGoogleMaps(apiKey: string) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    if (!apiKey) {
      setLoadError(new Error("Google Maps API Key is missing"));
      return;
    }

    if (window.google?.maps) {
      setIsLoaded(true);
      return;
    }

    const scriptId = "google-maps-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        setLoadError(new Error("Failed to load Google Maps script"));
      };
      script.onload = () => {
         setIsLoaded(true);
      };
      document.head.appendChild(script);
    } else {
       if (window.google?.maps) {
           setIsLoaded(true);
       } else {
           script.addEventListener('load', () => setIsLoaded(true));
           script.addEventListener('error', (e) => setLoadError(new Error("Failed to load Google Maps script")));
       }
    }
  }, [apiKey]);

  return { isLoaded, loadError };
}
