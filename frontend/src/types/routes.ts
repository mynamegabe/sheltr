export interface RoutePreference {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
}

export interface RouteOption {
  id: string;
  name: string;
  duration: string;
  distance: string;
  shadePercentage: number;
  transportModes: string[];
  polyline: string;
  isPreferred: boolean;
}

export interface Location {
  name: string;
  coordinates: [number, number];
}
