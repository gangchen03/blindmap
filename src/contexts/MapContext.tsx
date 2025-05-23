import { createContext, useContext, useState, ReactNode } from 'react';

export enum MapProvider {
  GOOGLE = 'google',
  OPENSTREETMAP = 'openstreetmap'
}

interface MapContextType {
  provider: MapProvider;
  setProvider: (provider: MapProvider) => void;
  destination: [number, number] | null;
  setDestination: (coords: [number, number] | null) => void;
  currentLocation: [number, number];
  setCurrentLocation: (coords: [number, number]) => void;
  isNavigating: boolean;
  setIsNavigating: (value: boolean) => void;
  directionsResult: google.maps.DirectionsResult | null;
  setDirectionsResult: (result: google.maps.DirectionsResult | null) => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export function MapProviderWrapper({ children }: { children: ReactNode }) {
  // const [provider, setProvider] = useState<MapProvider>(MapProvider.OPENSTREETMAP);
  const [provider, setProvider] = useState<MapProvider>(MapProvider.GOOGLE);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [currentLocation, setCurrentLocation] = useState<[number, number]>([40.7580, -73.9855]);
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  return (
    <MapContext.Provider value={{
      provider,
      setProvider,
      destination,
      setDestination,
      currentLocation,
      setCurrentLocation,
      isNavigating,
      setIsNavigating,
      directionsResult,
      setDirectionsResult
    }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapProvider() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapProvider must be used within a MapProviderWrapper');
  }
  return context;
}

export function useMap() {
  const context = useContext(MapContext);
  if (context === undefined) {
    throw new Error('useMap must be used within a MapProviderWrapper');
  }
  return context;
}