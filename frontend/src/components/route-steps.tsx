
import { useState, useMemo } from "react"
import { Clock, Navigation, MapPin, Footprints, Bus, Train, TramFront, Layers, List, ChevronLeft } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { formatDuration, formatDistance } from "@/lib/formatters"

export interface RouteStepsProps {
    route: any
    onClose?: () => void
    className?: string // Allow overriding styles
    hideHeader?: boolean // Option to hide header for mobile drawer context if needed
}

export function RouteStepContent({ route, onClose, className, hideHeader }: RouteStepsProps) {
    if (!route || !route.data || !route.data.legs || route.data.legs.length === 0) {
        return null
    }

    const leg = route.data.legs[0]
    const steps = leg.steps || []



    const getModeIcon = (mode: string) => {
        switch (mode) {
            case 'WALK': return <Footprints className="w-4 h-4 text-emerald-500" />
            case 'BUS': return <Bus className="w-4 h-4 text-blue-500" />
            case 'SUBWAY':
            case 'TRAIN': return <Train className="w-4 h-4 text-orange-500" />
            case 'TRAM':
            case 'LIGHT_RAIL': return <TramFront className="w-4 h-4 text-indigo-500" />
            default: return <Navigation className="w-4 h-4 text-muted-foreground" />
        }
    }

    const [isCondensed, setIsCondensed] = useState(true)

    const displaySteps = useMemo(() => {
        if (!isCondensed) return steps

        const condensed: any[] = []
        let pendingWalk: any = null

        steps.forEach((step: any) => {
            if (step.travelMode === 'WALK') {
                if (!pendingWalk) {
                    pendingWalk = { ...step, distanceMeters: step.distanceMeters || 0, staticDuration: step.staticDuration ? parseInt(step.staticDuration.replace('s', '')) : 0 }
                } else {
                    pendingWalk.distanceMeters += (step.distanceMeters || 0)
                    const dur = step.staticDuration ? parseInt(step.staticDuration.replace('s', '')) : 0
                    pendingWalk.staticDuration += dur
                }
            } else {
                if (pendingWalk) {
                    pendingWalk.staticDuration = `${pendingWalk.staticDuration}s`
                    pendingWalk.navigationInstruction = {
                        maneuver: `Walk for ${formatDuration(pendingWalk.staticDuration)}`,
                        instructions: `Total walking distance: ${formatDistance(pendingWalk.distanceMeters)}`
                    }
                    condensed.push(pendingWalk)
                    pendingWalk = null
                }
                condensed.push(step)
            }
        })

        if (pendingWalk) {
            pendingWalk.staticDuration = `${pendingWalk.staticDuration}s`
            pendingWalk.navigationInstruction = {
                maneuver: `Walk for ${formatDuration(pendingWalk.staticDuration)}`,
                instructions: `Total walking distance: ${formatDistance(pendingWalk.distanceMeters)}`
            }
            condensed.push(pendingWalk)
        }

        return condensed
    }, [steps, isCondensed])

    return (
        <div className={`flex flex-col h-full bg-background ${className || ''}`}>
            {!hideHeader && (
                <div className="p-4 border-b bg-muted/20 space-y-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Navigation className="w-5 h-5" />
                                Route Details
                            </h3>
                            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {leg.staticDuration ? formatDuration(leg.staticDuration) : route.duration}</span>
                                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {leg.distanceMeters ? formatDistance(leg.distanceMeters) : route.distance}</span>
                                {route.total_walk_length_m !== undefined && (
                                    <span className="flex items-center gap-1"><Footprints className="w-3.5 h-3.5" /> {formatDistance(route.total_walk_length_m)} Walk</span>
                                )}
                            </div>
                        </div>
                        {onClose && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClose}>
                                <ChevronLeft className="w-4 h-4" />
                                <span className="sr-only">Close</span>
                            </Button>
                        )}
                    </div>

                    <div className="flex items-center space-x-2">
                        <Switch id="condensed-mode" checked={isCondensed} onCheckedChange={setIsCondensed} />
                        <Label htmlFor="condensed-mode" className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                            {isCondensed ? <Layers className="w-3 h-3" /> : <List className="w-3 h-3" />}
                            {isCondensed ? "Condensed View" : "Detailed View"}
                        </Label>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-2">
                    {/* Start */}
                    <div className="flex gap-3">
                        <div className="flex flex-col items-center mx-[0.4rem]">
                            <div className="w-3 h-3 rounded-full bg-green-500 ring-4 ring-green-100 dark:ring-green-900/30" />
                            <div className="w-0.5 flex-1 bg-border my-1" />
                        </div>
                        <div className="pb-1">
                            <p className="font-medium text-sm leading-none">Start</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {leg.startLocation?.latLng?.latitude?.toFixed(4)}, {leg.startLocation?.latLng?.longitude?.toFixed(4)}
                            </p>
                        </div>
                    </div>

                    {/* Steps */}
                    {displaySteps.map((step: any, idx: number) => (
                        <div key={idx} className="flex gap-3 group">
                            <div className="flex flex-col items-center">
                                <div className="p-1 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                                    {getModeIcon(step.travelMode)}
                                </div>
                                {idx < displaySteps.length - 1 && <div className="w-0.5 flex-1 bg-border my-1" />}
                            </div>
                            <div className="flex-1 pb-4">
                                <div className="text-sm font-medium">
                                    {step.transitDetails?.transitLine?.name ? (
                                        <div className="flex flex-col">
                                            <span>
                                                Take {step.transitDetails.transitLine.vehicle?.name?.text || "Transit"} <span className="font-bold text-primary">{step.transitDetails.transitLine.name}</span>
                                            </span>
                                        </div>
                                    ) : (
                                        step.navigationInstruction?.maneuver || (step.travelMode === 'WALK' ? 'Walk' : 'Travel')
                                    )}
                                </div>
                                {step.navigationInstruction?.instructions && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {step.navigationInstruction.instructions}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground bg-muted/40 w-fit px-2 py-1 rounded">
                                    <span>{formatDistance(step.distanceMeters)}</span>
                                    <span>•</span>
                                    <span>{formatDuration(step.staticDuration)}</span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* End */}
                    <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-100 dark:ring-red-900/30 mx-[0.4rem]" />
                        </div>
                        <div>
                            <p className="font-medium text-sm leading-none">Arrive</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {leg.endLocation?.latLng?.latitude?.toFixed(4)}, {leg.endLocation?.latLng?.longitude?.toFixed(4)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Wrapper for desktop sidebar behavior
export function RouteSteps(props: RouteStepsProps) {
    return (
        <div className="w-80 h-full bg-background text-foreground border-r flex flex-col shadow-sm z-10">
            <RouteStepContent {...props} />
        </div>
    )
}
