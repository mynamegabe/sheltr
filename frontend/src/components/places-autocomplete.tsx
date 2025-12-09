import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { MapPin, Search, Loader2, Navigation } from "lucide-react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { cn } from "@/lib/utils";

interface PlacesAutocompleteProps {
    placeholder?: string;
    onPlaceSelect: (place: { address: string, latLng: { lat: number, lng: number } }) => void;
    defaultValue?: string;
    className?: string;
    showCurrentLocation?: boolean;
    onCurrentLocationSelect?: () => void;
}

export function PlacesAutocomplete({
    placeholder,
    onPlaceSelect,
    defaultValue = "",
    className,
    showCurrentLocation,
    onCurrentLocationSelect
}: PlacesAutocompleteProps) {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
    const { isLoaded } = useGoogleMaps(apiKey);

    const [inputValue, setInputValue] = useState(defaultValue);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [sessionToken, setSessionToken] = useState<any>(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Initialize session token when maps loaded
    useEffect(() => {
        if (isLoaded && !sessionToken && window.google?.maps?.places) {
            setSessionToken(new window.google.maps.places.AutocompleteSessionToken());
        }
    }, [isLoaded, sessionToken]);

    // Update internal state when defaultValue changes (e.g. from swap)
    useEffect(() => {
        setInputValue(defaultValue);
    }, [defaultValue]);

    const fetchSuggestions = async (input: string) => {
        if (!input || !sessionToken || !window.google?.maps?.places) return;

        try {
            const request = {
                input,
                sessionToken: sessionToken,
                locationBias: {
                    west: 103.6,
                    north: 1.48,
                    east: 104.05,
                    south: 1.15,
                },
            };

            const { suggestions } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
            setSuggestions(suggestions || []);
            setOpen(suggestions && suggestions.length > 0);
        } catch (error) {
            console.error("Error fetching places:", error);
            setSuggestions([]);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);

        if (val.length > 2) {
            fetchSuggestions(val);
        } else {
            setSuggestions([]);
            // Keep open if showCurrentLocation is true
            setOpen(!!showCurrentLocation);
        }
    };

    const handleSelect = async (suggestion: any) => {
        setLoading(true);
        try {
            const placePrediction = suggestion.placePrediction;
            const place = placePrediction.toPlace();

            await place.fetchFields({
                fields: ["displayName", "formattedAddress", "location"],
            });

            const address = place.formattedAddress || place.displayName;
            setInputValue(address);
            setOpen(false);

            onPlaceSelect({
                address: address,
                latLng: {
                    lat: place.location.lat(),
                    lng: place.location.lng()
                }
            });

            setSessionToken(new window.google.maps.places.AutocompleteSessionToken());

        } catch (error) {
            console.error("Error fetching place details:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCurrentLocationClick = () => {
        setInputValue("My Location");
        setOpen(false);
        if (onCurrentLocationSelect) {
            onCurrentLocationSelect();
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <div className={cn("relative", className)}>
                    <Input
                        value={inputValue}
                        onChange={handleInputChange}
                        placeholder={placeholder}
                        className="pr-8 bg-background"
                        // Handle focus to open suggestions if exists
                        onFocus={() => {
                            if (suggestions.length > 0 || showCurrentLocation) setOpen(true)
                        }}
                    />
                    <div className="absolute right-2.5 top-2.5 text-muted-foreground pointer-events-none">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </div>
                </div>
            </PopoverAnchor>
            <PopoverContent
                className="p-0 w-[var(--radix-popover-trigger-width)]"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <ul className="py-1 max-h-[300px] overflow-y-auto">
                    {showCurrentLocation && (
                        <li
                            onClick={handleCurrentLocationClick}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center gap-2 transition-colors border-b border-border/50 text-blue-600 dark:text-blue-400 font-medium"
                        >
                            <Navigation className="w-4 h-4 fill-current" />
                            <span>Use Current Location</span>
                        </li>
                    )}

                    {suggestions.map((suggestion, idx) => {
                        const mainText = suggestion.placePrediction.text.text;
                        return (
                            <li
                                key={idx}
                                onClick={() => handleSelect(suggestion)}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-start gap-2 transition-colors"
                            >
                                <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                                <span className="line-clamp-2">{mainText}</span>
                            </li>
                        );
                    })}
                </ul>
            </PopoverContent>
        </Popover>
    );
}
