import { useState, useEffect } from 'react';
import { 
  X, Loader2, MapPin, 
  Sun, Moon, Cloud, CloudSun, CloudMoon, 
  CloudRain, CloudDrizzle, CloudLightning, 
  CloudFog, Wind, Haze, CloudSunRain 
} from 'lucide-react';

// Helper: Maps API strings to Lucide Icons
const getWeatherIcon = (forecast: string) => {
  const lower = forecast.toLowerCase();

  // 1. CLEAR / FAIR
  if (lower.includes('fair (night)')) return <Moon className="w-5 h-5 text-indigo-300" />;
  if (lower.includes('fair')) return <Sun className="w-5 h-5 text-yellow-500" />;
  if (lower.includes('warm')) return <Sun className="w-5 h-5 text-orange-500" />;

  // 2. CLOUDY
  if (lower.includes('partly cloudy (night)')) return <CloudMoon className="w-5 h-5 text-indigo-400" />;
  if (lower.includes('partly cloudy')) return <CloudSun className="w-5 h-5 text-blue-400" />;
  if (lower.includes('cloudy')) return <Cloud className="w-5 h-5 text-gray-400" />;

  // 3. ATMOSPHERE (Haze, Mist, Wind)
  if (lower.includes('hazy') || lower.includes('haze')) return <Haze className="w-5 h-5 text-yellow-600" />;
  if (lower.includes('mist') || lower.includes('fog')) return <CloudFog className="w-5 h-5 text-gray-300" />;
  if (lower.includes('wind')) return <Wind className="w-5 h-5 text-teal-500" />;

  // 4. RAIN & SHOWERS
  // "Passing" usually implies sun is still poking through or it's brief
  if (lower.includes('passing')) return <CloudSunRain className="w-5 h-5 text-blue-400" />;
  if (lower.includes('light rain') || lower.includes('light showers')) return <CloudDrizzle className="w-5 h-5 text-blue-300" />;
  
  // Thunder dominates other rain types
  if (lower.includes('thundery')) return <CloudLightning className="w-5 h-5 text-purple-500" />;
  
  // General Rain (Heavy, Moderate, Showers)
  if (lower.includes('rain') || lower.includes('showers')) return <CloudRain className="w-5 h-5 text-blue-600" />;

  // Default fallback
  return <Cloud className="w-5 h-5 text-gray-300" />;
};

interface WeatherItem {
  city: string;
  distance: number;
  description: string;
}

interface WeatherForecastProps {
  overrideCoords: { lat: number; lon: number } | null;
}

export function WeatherForecast({ overrideCoords }: WeatherForecastProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [forecasts, setForecasts] = useState<WeatherItem[]>([]);
  const [loading, setLoading] = useState(false);

  // ... (Your fetchWeather and useEffect logic stays exactly the same) ...
  const fetchWeather = (lat: number, lon: number) => {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_BASE_URL || "/api";

      fetch(`${API_URL}/weather?lat=${lat}&lon=${lon}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
            if (Array.isArray(data)) setForecasts(data);
            else setForecasts([]);
            setLoading(false);
        })
        .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      if (overrideCoords) {
          fetchWeather(overrideCoords.lat, overrideCoords.lon);
      } else if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
              (position) => fetchWeather(position.coords.latitude, position.coords.longitude),
              () => fetchWeather(1.3521, 103.8198)
          );
      } else {
          fetchWeather(1.3521, 103.8198);
      }
    }
  }, [isOpen, overrideCoords]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="absolute top-4 right-4 z-50 inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white text-black h-12 w-12 shadow-xl hover:bg-gray-100 hover:scale-110 transition-all"
      >
        <Cloud className="h-6 w-6" />
        <span className="sr-only">Open Weather</span>
      </button>

      {isOpen && (

        <div 
            className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setIsOpen(false)}
        >

          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden cursor-default"
            onClick={(e) => e.stopPropagation()} 
          >
            
            <div className="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center">
                <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-blue-500" />
                    Nearby Weather
                </h2>
                <button 
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin h-8 w-8 text-blue-500"/>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {forecasts.map((item, index) => {
                            const isClosest = index === 0;
                            
                            return (
                                <div 
                                    key={item.city}
                                    className={`flex justify-between items-center p-3 rounded-lg border transition-all ${
                                        isClosest 
                                        ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                        : 'bg-white border-gray-100 text-gray-600'
                                    }`}
                                >

                                    <div>
                                        <p className={`font-semibold ${isClosest ? 'text-blue-700' : 'text-gray-700'}`}>
                                            {item.city}
                                        </p>
                                        {isClosest && (
                                            <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-500 mt-0.5">
                                                <MapPin className="w-3 h-3" />
                                                Closest Station
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 text-right">
                                        <span className="font-medium text-sm block">
                                            {item.description}
                                        </span>
                                        {getWeatherIcon(item.description)}
                                    </div>
                                </div>
                            );
                        })}
                        {forecasts.length === 0 && !loading && (
                            <p className="text-center text-gray-500 py-4">No data available.</p>
                        )}
                    </div>
                )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}