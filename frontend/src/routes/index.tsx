import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, useMap, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import clsx from 'clsx'
import { Search, MapPin, Navigation, Sun, Clock, Ruler, TreeDeciduous, Menu, X } from 'lucide-react'

// Shadcn Components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ModeToggle } from "@/components/mode-toggle"
import { useTheme } from "@/components/theme-provider"

export const Route = createFileRoute('/')({
  component: Index,
})

// Helper to update map view
function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  map.setView(center, zoom)
  return null
}

const ROUTE_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
]

function Index() {
  const [origin, setOrigin] = useState('Singapore Management University, Singapore')
  const [destination, setDestination] = useState('National Museum of Singapore, Singapore')
  const [loading, setLoading] = useState(false)
  const [routes, setRoutes] = useState<any[]>([])
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  
  // Theme management for map tiles
  const { theme } = useTheme()
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const root = window.document.documentElement
    const checkTheme = () => {
        if (root.classList.contains('dark')) {
            setActualTheme('dark')
        } else {
            setActualTheme('light')
        }
    }
    
    checkTheme()
    
    const observer = new MutationObserver(checkTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [theme])
  
  // Singapore Center
  const [mapCenter, setMapCenter] = useState<[number, number]>([1.296568, 103.852119]) // SMU area
  const [mapZoom] = useState(15)

  const handleRoute = async () => {
    setLoading(true)
    setRoutes([])
    setSelectedRouteIndex(null)
    
    try {
      const response = await axios.post('http://localhost:8000/routes', {
        origin,
        destination,
        travel_mode: 'WALK',
        prefer_shade: true,
        // timezone offset for Singapore
        start_time: new Date().toISOString().replace('Z', '+08:00') 
      })
      
      const data = response.data
      setRoutes(data)
      
      if (data.length > 0) {
        // Automatically select best route
        setSelectedRouteIndex(0)
        
        // Try to center map on start of first route
        const firstRoute = data[0]
        if (firstRoute.data?.legs?.[0]?.startLocation?.latLng) {
            const lat = firstRoute.data.legs[0].startLocation.latLng.latitude
            const lng = firstRoute.data.legs[0].startLocation.latLng.longitude
            setMapCenter([lat, lng])
        }
      }
      
    } catch (error) {
      console.error("Error fetching routes:", error)
      alert("Failed to fetch routes. Check backend console.")
    } finally {
      setLoading(false)
    }
  }

  // Decode Google Polyline
  const decodePolyline = (encoded: string) => {
    if (!encoded) return []
    const poly = []
    let index = 0, len = encoded.length
    let lat = 0, lng = 0

    while (index < len) {
      let b, shift = 0, result = 0
      do {
        b = encoded.charAt(index++).charCodeAt(0) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1))
      lat += dlat

      shift = 0
      result = 0
      do {
        b = encoded.charAt(index++).charCodeAt(0) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1))
      lng += dlng

      poly.push([lat / 1e5, lng / 1e5] as [number, number])
    }
    return poly
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Map View */}
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        className="h-full w-full z-0"
        zoomControl={false}
      >
        <MapUpdater center={mapCenter} zoom={mapZoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={
            actualTheme === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
        />
        
        {/* Draw all routes */}
        {routes.map((route, idx) => {
          const polyline = route.data?.polyline?.encodedPolyline
          if (!polyline) return null
          const positions = decodePolyline(polyline)
          const color = ROUTE_COLORS[idx % ROUTE_COLORS.length]
          const isSelected = selectedRouteIndex === idx
          
          return (
            <Polyline
              key={idx}
              positions={positions}
              pathOptions={{
                color: color,
                weight: isSelected ? 6 : 4,
                opacity: isSelected ? 0.9 : 0.5,
              }}
            />
          )
        })}
      </MapContainer>

      {/* Mobile Menu Toggle */}
      <Button
        variant="default"
        size="icon"
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className="fixed top-4 left-4 z-50 md:hidden shadow-lg bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700"
      >
        {isPanelOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Search & Controls Panel */}
      <div
        className={`
          fixed top-0 left-0 h-full w-full md:w-96 z-40 transition-transform duration-300 ease-out
          ${isPanelOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-r border-border shadow-lg overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                  <Sun className="w-5 h-5 text-orange-500 fill-orange-500" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">SunRouter</h1>
                  <p className="text-sm text-muted-foreground">Singapore's shade-first navigation</p>
                </div>
              </div>
              <ModeToggle />
            </div>

            {/* Divider */}
            <Separator />

            {/* Search Panel */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-green-500" /> Origin
                </label>
                <Input 
                  className="h-10"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Enter origin..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-red-500" /> Destination
                </label>
                <Input 
                  className="h-10"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Enter destination..."
                />
              </div>
              <Button 
                className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                onClick={handleRoute}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Search className="w-4 h-4 mr-2 animate-spin" /> Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" /> Find Routes
                  </>
                )}
              </Button>
            </div>

            {/* Route Options */}
            {routes.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Routes Found ({routes.length})</h3>
                  <div className="space-y-2">
                    {routes.map((route, idx) => {
                      const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
                      const isSelected = selectedRouteIndex === idx;

                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedRouteIndex(idx)}
                          className={clsx(
                            "w-full text-left rounded-lg border p-3 transition-all hover:bg-accent",
                            isSelected ? "bg-accent border-primary/50 shadow-sm" : "bg-transparent border-border"
                          )}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="font-medium text-sm">Route {idx + 1}</span>
                            </div>
                            <span className={clsx(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                              route.shadow_ratio > 0.5 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                              route.shadow_ratio > 0.2 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                              "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            )}>
                              {(route.shadow_ratio * 100).toFixed(0)}% Shade
                            </span>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground mb-1">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {route.duration}</span>
                            <span className="flex items-center gap-1"><Ruler className="w-3 h-3" /> {route.distance}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground/60 truncate">
                            via {route.summary}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Empty State */}
            {routes.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
                  <Sun className="w-8 h-8 text-orange-500 animate-pulse" />
                </div>
                <h3 className="font-medium text-foreground mb-1">Find your cool path</h3>
                <p className="text-sm text-muted-foreground">
                  Enter your origin and destination to discover shade-optimized routes
                </p>
              </div>
            )}

            {/* Attribution */}
            <Separator />
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Built for Singapore's thermal comfort
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Legend (bottom right) */}
      <div className="fixed bottom-4 right-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border border-border rounded-lg p-3 z-30 shadow-lg">
        <p className="text-xs font-medium text-muted-foreground mb-2">Shade Level</p>
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>High (&gt;50%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span>Medium (20-50%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Low (&lt;20%)</span>
          </div>
        </div>
      </div>
    </div>
  )
}