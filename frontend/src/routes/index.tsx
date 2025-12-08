import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, useMap, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import clsx from 'clsx'
import { Search, MapPin, Navigation, Sun, Clock, Ruler } from 'lucide-react'

// Shadcn Components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"
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
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="h-16 border-b border-sidebar-border flex flex-row items-center justify-between px-6">
             <div className="flex items-center gap-2">
                 <div className="flex bg-primary/10 rounded-lg p-1">
                    <Sun className="w-5 h-5 text-orange-500 fill-orange-500" />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold tracking-tight leading-none">SunRouter</span>
                    <span className="text-[10px] text-muted-foreground leading-none">Pathfinder</span>
                </div>
            </div>
            <ModeToggle />
        </SidebarHeader>
        <SidebarContent>
            <SidebarGroup>
                <div className="px-2 pb-2">
                    <Card className="shadow-none border-0 bg-sidebar-accent/50">
                        <CardContent className="p-4 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-green-500" /> Origin
                                </label>
                                <Input 
                                    className="h-9 bg-background"
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
                                    className="h-9 bg-background"
                                    value={destination}
                                    onChange={(e) => setDestination(e.target.value)}
                                    placeholder="Enter destination..."
                                />
                            </div>
                            <Button 
                                className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                                size="sm"
                                onClick={handleRoute}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Search className="w-3.5 h-3.5 mr-2 animate-spin" /> Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-3.5 h-3.5 mr-2" /> Find Routes
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </SidebarGroup>

            {routes.length > 0 && (
                <>
                    <Separator className="my-2" />
                    <SidebarGroup>
                        <SidebarGroupLabel>Routes Found ({routes.length})</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu className="space-y-2 px-2">
                                {routes.map((route, idx) => {
                                    const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
                                    const isSelected = selectedRouteIndex === idx;

                                    return (
                                        <SidebarMenuItem key={idx}>
                                            <button
                                                onClick={() => setSelectedRouteIndex(idx)}
                                                className={clsx(
                                                    "w-full text-left rounded-lg border p-3 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                                    isSelected ? "bg-sidebar-accent border-primary/50 shadow-sm" : "bg-transparent border-transparent"
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
                                        </SidebarMenuItem>
                                    );
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </>
            )}
        </SidebarContent>
      </Sidebar>
      
      <SidebarInset className="relative h-screen overflow-hidden">
        {/* Map Header Overlay */}
        <div className="absolute top-4 left-4 z-[500]">
             <SidebarTrigger className="bg-white/90 backdrop-blur shadow-md border hover:bg-white dark:bg-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700" />
        </div>

        <div className="w-full h-full bg-gray-100 dark:bg-neutral-900">
            <MapContainer 
            center={mapCenter} 
            zoom={mapZoom} 
            className="h-full w-full z-0"
            zoomControl={false}
            >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url={actualTheme === 'dark' 
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                }
            />
            <MapUpdater center={mapCenter} zoom={mapZoom} />
            
            {routes.map((route, idx) => {
                const isSelected = selectedRouteIndex === idx;
                if (!isSelected) return null;

                const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];

                const polyline = route.data?.polyline?.encodedPolyline;
                if (!polyline) return null;
                
                const positions = decodePolyline(polyline);
                
                // Get Start/End positions for Markers (Only for selected)
                let startPos: [number, number] | null = null;
                let endPos: [number, number] | null = null;
                
                if (route.data?.legs?.[0]) {
                    const leg = route.data.legs[0];
                    if (leg.startLocation?.latLng) {
                        startPos = [leg.startLocation.latLng.latitude, leg.startLocation.latLng.longitude];
                    }
                    if (leg.endLocation?.latLng) {
                        endPos = [leg.endLocation.latLng.latitude, leg.endLocation.latLng.longitude];
                    }
                }
                
                return (
                 <div key={idx}>
                    <Polyline 
                        positions={positions}
                        color={color}
                        weight={8}
                        opacity={1.0}
                        eventHandlers={{
                            click: () => {
                                setSelectedRouteIndex(idx)
                            }
                        }}
                    />
                    
                    {startPos && (
                        <Marker 
                            position={startPos}
                            icon={L.divIcon({
                                className: 'bg-transparent',
                                html: `<div style="background-color: white; border: 2px solid #22c55e; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                       </div>`,
                                iconSize: [32, 32],
                                iconAnchor: [16, 32] 
                            })}
                        />
                    )}
                    
                    {endPos && (
                        <Marker 
                            position={endPos}
                            icon={L.divIcon({
                                className: 'bg-transparent',
                                html: `<div style="background-color: white; border: 2px solid #ef4444; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                                       </div>`,
                                iconSize: [32, 32],
                                iconAnchor: [16, 16] 
                            })}
                        />
                    )}
                 </div>
                )
            })}
            
            </MapContainer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
