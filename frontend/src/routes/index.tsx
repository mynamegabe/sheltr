import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useGeolocated } from "react-geolocated";
import {
  MapContainer,
  TileLayer,
  Polyline,
  useMap,
  Marker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import clsx from "clsx";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Search,
  MapPin,
  Navigation,
  Sun,
  Clock,
  Ruler,
  ArrowUpDown,
  Bus,
  Footprints,
  Train,
  TramFront,
} from "lucide-react";
import { DateTimePicker } from "@/components/date-time";
import { RouteSteps } from "@/components/route-steps";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Shadcn Components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/components/theme-provider";

// Waze-like Reporting Feature
import ReportButton from "@/components/ReportButton";
import type { Report } from "@/components/ReportButton";
import { REPORT_TYPES } from "@/components/ReportButton";

// Dialog for report details (from original MapView)
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  component: Index,
});

const REPORTS_STORAGE_KEY = "coolpath-reports";

// Helper to update map view
function MapUpdater({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

const ROUTE_COLORS = [
  "#ef4444", // Red
  "#3b82f6", // Blue
  "#10b981", // Green
  "#f59e0b", // Amber
  "#8b5cf6", // Violet
  "#ec4899", // Pink
];

function FloatingTrigger() {
  const { isMobile, state, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : state === "expanded";

  if (isOpen) return null;

  return (
    <div className="absolute top-4 left-4 z-[500] animate-in fade-in duration-300">
      <SidebarTrigger className="bg-white/90 backdrop-blur shadow-md border hover:bg-white dark:bg-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700" />
    </div>
  );
}

function Index() {
  const [origin, setOrigin] = useState<string | undefined>();
  const [destination, setDestination] = useState<string | undefined>();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string>(
    new Date().toTimeString().slice(0, 5)
  );
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(
    null
  );

  // Travel Mode & Preferences
  const [travelMode, setTravelMode] = useState<"WALK" | "TRANSIT">("TRANSIT");
  const [allowedTransitModes, setAllowedTransitModes] = useState<string[]>([]);
  const [transitRoutingPreference, setTransitRoutingPreference] =
    useState<string>("LESS_WALKING");

  const [sortBy, setSortBy] = useState<string>("time");

  // ========== WAZE-LIKE REPORTING FEATURE ==========
  // Initialize reports from localStorage with 2-hour expiration filter
  const [reports, setReports] = useState<Report[]>(() => {
    const stored = localStorage.getItem(REPORTS_STORAGE_KEY);
    if (stored) {
      const parsed: Report[] = JSON.parse(stored);
      // Filter out reports older than 2 hours
      return parsed.filter(
        (r) => Date.now() - r.timestamp < 2 * 60 * 60 * 1000
      );
    }
    return [];
  });

  // Selected report for dialog (from original MapView)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  // Handler for report confirmations
  const handleConfirmReport = (reportId: string) => {
    const updated = reports.map((r) =>
      r.id === reportId ? { ...r, confirmations: r.confirmations + 1 } : r
    );
    setReports(updated);
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(updated));
  };

  // Handler for report denials (removes after 3 denials)
  const handleDenyReport = (reportId: string) => {
    const DENIAL_THRESHOLD = 3;
    const updated = reports
      .map((r) => (r.id === reportId ? { ...r, denials: r.denials + 1 } : r))
      .filter((r) => r.denials < DENIAL_THRESHOLD);
    setReports(updated);
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(updated));
  };
  // ========== END REPORTING FEATURE ==========

  // Confirm / deny handlers used by the dialog (logic identical to original MapView)
  const handleConfirm = () => {
    if (selectedReport) {
      handleConfirmReport(selectedReport.id);
      setSelectedReport(null);
    }
  };

  const handleDeny = () => {
    if (selectedReport) {
      handleDenyReport(selectedReport.id);
      setSelectedReport(null);
    }
  };

  const sortedRoutes = [...routes].sort((a, b) => {
    if (sortBy === "time") {
      // Parse "688s" to 688
      const durationA = parseInt(a.duration.replace("s", ""));
      const durationB = parseInt(b.duration.replace("s", ""));
      return durationA - durationB;
    } else if (sortBy === "distance") {
      // Handle potential data structure variations
      const distA = a.data?.distanceMeters ?? a.distanceMeters ?? 0;
      const distB = b.data?.distanceMeters ?? b.distanceMeters ?? 0;
      return distA - distB;
    } else if (sortBy === "shade") {
      // Descending shade
      return b.shadow_ratio - a.shadow_ratio;
    }
    return 0;
  });

  const swapLocations = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  // Theme management for map tiles
  const { theme } = useTheme();
  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = window.document.documentElement;
    const checkTheme = () => {
      if (root.classList.contains("dark")) {
        setActualTheme("dark");
      } else {
        setActualTheme("light");
      }
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [theme]);

  // Singapore Center
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    1.296568, 103.852119,
  ]); // SMU area
  const [mapZoom] = useState(15);

  const { coords } = useGeolocated({
    positionOptions: {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000,
    },
    userDecisionTimeout: 5000,
    watchPosition: true,
  });

  const handleRoute = async () => {
    setLoading(true);
    setRoutes([]);
    setSelectedRouteIndex(null);

    try {
      const response = await axios.post("http://192.168.1.127:8000/routes", {
        origin:
          origin === "My Location" && coords
            ? {
                location: {
                  latLng: {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  },
                },
              }
            : origin,
        destination:
          destination === "My Location" && coords
            ? `${coords.latitude},${coords.longitude}`
            : destination,
        travel_mode: travelMode,
        transit_preferences:
          travelMode === "TRANSIT"
            ? {
                allowed_travel_modes:
                  allowedTransitModes.length > 0
                    ? allowedTransitModes
                    : undefined,
                routing_preference: transitRoutingPreference,
              }
            : undefined,
        prefer_shade: true,
        start_time:
          date && time
            ? (() => {
                const d = new Date(date);
                const [h, m] = time.split(":").map(Number);
                d.setHours(h, m, 0, 0);
                return d.toISOString();
              })()
            : new Date().toISOString(),
      });

      const data = response.data;
      setRoutes(data);

      if (data.length > 0) {
        // Automatically select best route
        setSelectedRouteIndex(0);

        // Try to center map on start of first route
        const firstRoute = data[0];
        if (firstRoute.data?.legs?.[0]?.startLocation?.latLng) {
          const lat = firstRoute.data.legs[0].startLocation.latLng.latitude;
          const lng = firstRoute.data.legs[0].startLocation.latLng.longitude;
          setMapCenter([lat, lng]);
        }
      }
    } catch (error) {
      console.error("Error fetching routes:", error);
      alert("Failed to fetch routes. Check backend console.");
    } finally {
      setLoading(false);
    }
  };

  // Decode Google Polyline
  const decodePolyline = (encoded: string) => {
    if (!encoded) return [];
    const poly = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0,
      lng = 0;

    while (index < len) {
      let b,
        shift = 0,
        result = 0;
      do {
        b = encoded.charAt(index++).charCodeAt(0) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charAt(index++).charCodeAt(0) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      poly.push([lat / 1e5, lng / 1e5] as [number, number]);
    }
    return poly;
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="h-16 border-b border-sidebar-border flex flex-row items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <div className="flex bg-primary/10 rounded-lg p-1">
              <Sun className="w-5 h-5 text-orange-500 fill-orange-500" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight leading-none">
                Sheltr
              </span>
              <span className="text-[10px] text-muted-foreground leading-none">
                Accessibility-focused pathfinder
              </span>
            </div>
          </div>
          <ModeToggle />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <div className="px-2">
              <Card className="shadow-none border-0 bg-sidebar-accent/50">
                <CardContent className="px-2 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-green-500" /> Origin
                    </label>
                    <PlacesAutocomplete
                      className="bg-background"
                      defaultValue={origin}
                      onPlaceSelect={(place) => setOrigin(place.address)}
                      placeholder="Enter origin..."
                      showCurrentLocation={true}
                      onCurrentLocationSelect={() => setOrigin("My Location")}
                    />
                  </div>

                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-full text-muted-foreground hover:text-foreground"
                      onClick={swapLocations}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" /> Swap
                      Locations
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-red-500" />{" "}
                      Destination
                    </label>
                    <PlacesAutocomplete
                      className="bg-background"
                      defaultValue={destination}
                      onPlaceSelect={(place) => setDestination(place.address)}
                      placeholder="Enter destination..."
                    />
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-4">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Travel Mode
                    </Label>
                    <RadioGroup
                      value={travelMode}
                      onValueChange={(val: "WALK" | "TRANSIT") =>
                        setTravelMode(val)
                      }
                      className="flex gap-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="WALK" id="mode-walk" />
                        <Label
                          htmlFor="mode-walk"
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <Footprints className="w-4 h-4" /> Walk
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="TRANSIT" id="mode-transit" />
                        <Label
                          htmlFor="mode-transit"
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <Bus className="w-4 h-4" /> Transit
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {travelMode === "TRANSIT" && (
                    <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Allowed Modes
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          {["BUS", "SUBWAY", "TRAIN", "LIGHT_RAIL"].map(
                            (mode) => (
                              <div
                                key={mode}
                                className="flex items-center space-x-2"
                              >
                                <Checkbox
                                  id={`mode-${mode}`}
                                  checked={allowedTransitModes.includes(mode)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setAllowedTransitModes([
                                        ...allowedTransitModes,
                                        mode,
                                      ]);
                                    } else {
                                      setAllowedTransitModes(
                                        allowedTransitModes.filter(
                                          (m) => m !== mode
                                        )
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`mode-${mode}`}
                                  className="text-xs cursor-pointer capitalize"
                                >
                                  {mode.replace("_", " ").toLowerCase()}
                                </Label>
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Preference
                        </Label>
                        <RadioGroup
                          value={transitRoutingPreference}
                          onValueChange={setTransitRoutingPreference}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value="LESS_WALKING"
                              id="pref-less-walk"
                            />
                            <Label
                              htmlFor="pref-less-walk"
                              className="text-xs cursor-pointer"
                            >
                              Less Walking
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value="FEWER_TRANSFERS"
                              id="pref-fewer-transfer"
                            />
                            <Label
                              htmlFor="pref-fewer-transfer"
                              className="text-xs cursor-pointer"
                            >
                              Fewer Transfers
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-sm mb-2"
                    size="sm"
                    onClick={handleRoute}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Search className="w-3.5 h-3.5 animate-spin" />{" "}
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" /> Find Routes
                      </>
                    )}
                  </Button>

                  <Separator className="my-2" />

                  <div className="space-y-2">
                    <DateTimePicker
                      date={date}
                      setDate={setDate}
                      time={time}
                      setTime={setTime}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </SidebarGroup>

          {routes.length > 0 && (
            <>
              <Separator className="my-2" />
              <SidebarGroup>
                <div className="px-2 flex items-center justify-between mb-2">
                  <SidebarGroupLabel className="p-0">
                    Routes Found ({routes.length})
                  </SidebarGroupLabel>
                  <div className="w-[110px]">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-7 text-xs bg-sidebar-accent/50 border-0 focus:ring-0">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time" className="text-xs">
                          Time
                        </SelectItem>
                        <SelectItem value="distance" className="text-xs">
                          Distance
                        </SelectItem>
                        <SelectItem value="shade" className="text-xs">
                          Shade %
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-2 px-2">
                    {sortedRoutes.map((route, idx) => {
                      const originalIndex = routes.indexOf(route);

                      const color =
                        ROUTE_COLORS[originalIndex % ROUTE_COLORS.length];
                      const isSelected = selectedRouteIndex === originalIndex;

                      return (
                        <SidebarMenuItem key={originalIndex}>
                          <button
                            onClick={() => {
                              if (isSelected) {
                                setSelectedRouteIndex(null);
                              } else {
                                setSelectedRouteIndex(originalIndex);
                              }
                            }}
                            className={clsx(
                              "w-full text-left rounded-lg border p-3 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              isSelected
                                ? "bg-sidebar-accent border-primary/50 shadow-sm"
                                : "bg-transparent border-transparent"
                            )}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="font-medium text-sm">
                                  Route {idx + 1}
                                </span>
                              </div>
                              <span
                                className={clsx(
                                  "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                                  route.shadow_ratio > 0.5
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : route.shadow_ratio > 0.2
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                )}
                              >
                                {(route.shadow_ratio * 100).toFixed(0)}% Shade •{" "}
                                {(route.exposed_distance_m ?? 0).toFixed(0)}m
                                exposed
                              </span>
                            </div>
                            <div className="flex gap-3 text-xs text-muted-foreground mb-1">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {route.duration}
                              </span>
                              <span className="flex items-center gap-1">
                                <Ruler className="w-3 h-3" /> {route.distance}
                              </span>
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
        <FloatingTrigger />

        {selectedRouteIndex !== null && routes[selectedRouteIndex] && (
          <div className="absolute top-0 left-0 bottom-0 z-[5] h-full shadow-2xl animate-in slide-in-from-left-10 fade-in duration-300">
            <RouteSteps
              route={routes[selectedRouteIndex]}
              onClose={() => setSelectedRouteIndex(null)}
            />
          </div>
        )}

        <div className="absolute inset-0 w-full h-full">
          <div className="w-full h-full bg-gray-100 dark:bg-neutral-900">
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              className="h-full w-full z-0"
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url={
                  actualTheme === "dark"
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                }
              />
              <MapUpdater center={mapCenter} zoom={mapZoom} />

              {routes.map((route, idx) => {
                const isSelected = selectedRouteIndex === idx;
                if (!isSelected) return null;

                const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];

                // For selected route, render segments (legs[0].steps) to support different styles
                let segments: any[] = [];
                const steps = route.data?.legs?.[0]?.steps;

                if (steps && steps.length > 0) {
                  segments = steps.map((step: any) => {
                    const path = decodePolyline(
                      step.polyline?.encodedPolyline || ""
                    );
                    return {
                      positions: path,
                      mode: step.travelMode,
                    };
                  });
                } else {
                  segments = [
                    {
                      positions: decodePolyline(
                        route.data?.polyline?.encodedPolyline || ""
                      ),
                      mode: "TRANSIT",
                    },
                  ];
                }

                // Get Start/End positions for Markers
                let startPos: [number, number] | null = null;
                let endPos: [number, number] | null = null;

                if (route.data?.legs?.[0]) {
                  const leg = route.data.legs[0];
                  if (leg.startLocation?.latLng) {
                    startPos = [
                      leg.startLocation.latLng.latitude,
                      leg.startLocation.latLng.longitude,
                    ];
                  }
                  if (leg.endLocation?.latLng) {
                    endPos = [
                      leg.endLocation.latLng.latitude,
                      leg.endLocation.latLng.longitude,
                    ];
                  }
                }

                return (
                  <div key={idx}>
                    {segments.map((seg, segIdx) => (
                      <Polyline
                        key={segIdx}
                        positions={seg.positions}
                        color={color}
                        weight={8}
                        opacity={1.0}
                        lineCap="round"
                        dashArray={seg.mode === "WALK" ? "10,10" : undefined}
                        eventHandlers={{
                          click: () => {
                            setSelectedRouteIndex(idx);
                          },
                        }}
                      />
                    ))}

                    {/* Transition Markers */}
                    {segments.map((seg, segIdx) => {
                      if (segIdx === 0) return null;
                      const prevMode = segments[segIdx - 1].mode;
                      const currMode = seg.mode;

                      if (prevMode === currMode) return null;

                      const position = seg.positions[0];
                      if (!position) return null;

                      let IconComponent = null;
                      let colorClass = "#22c55e";

                      if (currMode === "TRANSIT") {
                        IconComponent = Bus;
                        colorClass = "#3b82f6";
                      } else if (
                        currMode === "SUBWAY" ||
                        currMode === "TRAIN"
                      ) {
                        IconComponent = Train;
                        colorClass = "#f97316";
                      } else if (
                        currMode === "LIGHT_RAIL" ||
                        currMode === "TRAM"
                      ) {
                        IconComponent = TramFront;
                        colorClass = "#6366f1";
                      } else if (currMode === "WALK") {
                        IconComponent = Footprints;
                        colorClass = "#10b981";
                      }

                      if (!IconComponent) return null;

                      const iconHtml = renderToStaticMarkup(
                        <div
                          style={{
                            backgroundColor: "white",
                            border: `2px solid ${colorClass}`,
                            borderRadius: "50%",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                          }}
                        >
                          <IconComponent size={14} color={colorClass} />
                        </div>
                      );

                      return (
                        <Marker
                          key={`marker-${segIdx}`}
                          position={position}
                          icon={L.divIcon({
                            className: "bg-transparent",
                            html: iconHtml,
                            iconSize: [24, 24],
                            iconAnchor: [12, 12],
                          })}
                        />
                      );
                    })}

                    {startPos && (
                      <Marker
                        position={startPos}
                        icon={L.divIcon({
                          className: "bg-transparent",
                          html: `<div style="background-color: white; border: 2px solid #22c55e; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                       </div>`,
                          iconSize: [32, 32],
                          iconAnchor: [16, 32],
                        })}
                      />
                    )}

                    {endPos && (
                      <Marker
                        position={endPos}
                        icon={L.divIcon({
                          className: "bg-transparent",
                          html: `<div style="background-color: white; border: 2px solid #ef4444; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                                       </div>`,
                          iconSize: [32, 32],
                          iconAnchor: [16, 16],
                        })}
                      />
                    )}
                  </div>
                );
              })}

              {coords && (
                <Marker
                  position={[coords.latitude, coords.longitude]}
                  icon={L.divIcon({
                    className: "bg-transparent",
                    html: renderToStaticMarkup(
                      <div className="relative flex items-center justify-center w-8 h-8">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex h-4 w-4 rounded-full bg-blue-500 border-2 border-white shadow-lg"></span>
                      </div>
                    ),
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                  })}
                />
              )}

              {/* Report Markers */}
              {reports.map((report) => {
                const [lng, lat] = report.coordinates;
                const reportType = REPORT_TYPES.find(
                  (t) => t.type === report.type
                );
                const pinColor = reportType?.color ?? "#f59e0b"; // fallback color
                const reportIconHtml = `
    <div style="
      position: relative;
      width: 40px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none; /* ✅ make all inner content click-through */
    ">
      <div style="
        position: absolute;
        width: 40px;
        height: 40px;
        background: white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        border: 4px solid ${pinColor};
      "></div>
      <div style="
        position: relative;
        z-index: 1;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        ${report.icon}
      </div>
    </div>
  `;

                return (
                  <Marker
                    key={report.id}
                    position={[lat, lng]}
                    icon={L.divIcon({
                      className: "bg-transparent",
                      html: reportIconHtml,
                      iconSize: [40, 50],
                      iconAnchor: [20, 45],
                    })}
                    eventHandlers={{
                      click: () => setSelectedReport(report),
                    }}
                  />
                );
              })}
            </MapContainer>
          </div>
        </div>

        {/* ========== WAZE-LIKE REPORT BUTTON ========== */}
        <div className="absolute bottom-8 right-6 z-[400]">
          <ReportButton reports={reports} onReportsChange={setReports} />
        </div>

        {/* ========== REPORT DETAIL DIALOG (from original MapView) ========== */}
        <Dialog
          open={!!selectedReport}
          onOpenChange={(open) => !open && setSelectedReport(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="text-2xl">{selectedReport?.icon}</span>
                {selectedReport?.label}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {selectedReport?.details && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Details</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedReport.details}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>👍</span>
                <span>
                  {selectedReport?.confirmations} confirmation
                  {selectedReport && selectedReport.confirmations !== 1
                    ? "s"
                    : ""}
                </span>
              </div>
            </div>
            <DialogFooter className="flex gap-3 sm:gap-3">
              <Button variant="outline" onClick={handleDeny} className="flex-1">
                <span className="mr-2">👎</span>
                Not there
              </Button>
              <Button onClick={handleConfirm} className="flex-1">
                <span className="mr-2">👍</span>
                Still there
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
