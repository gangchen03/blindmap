import { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { useMap } from '../contexts/MapContext'; // Assuming this is the correct hook

interface MapProps {
  center: [number, number]; // Corresponds to initialCenter or currentLocation
  zoom: number; // Corresponds to initialZoom
  isVisible: boolean; // To control map initialization and visibility
}

export const GoogleMap = ({ center, zoom, isVisible }: MapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  
  // Get directionsResult and currentLocation from context
  const { directionsResult, currentLocation } = useMap();

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.error('Google Maps API key is missing. Please check your .env file');
      return;
    }

    if (!isVisible || !mapRef.current) {
      // If map was visible and is now hidden, or unmounting, perform cleanup
      if (mapInstanceRef.current) { // Check if map instance exists
        directionsRendererRef.current?.setMap(null);
        // mapInstanceRef.current = null; // Null out to ensure re-initialization if it becomes visible again
        // directionsRendererRef.current = null; // Optionally null out renderer too
      }
      // If specifically becoming hidden, ensure refs are cleared for re-init
      if (!isVisible && mapInstanceRef.current) {
         mapInstanceRef.current = null;
         directionsRendererRef.current = null;
      }
      return;
    }

    // Initialize map and renderer only if map instance doesn't exist for this visible period
    if (!mapInstanceRef.current && mapRef.current) {
      const loader = new Loader({
        apiKey,
        version: 'weekly',
        libraries: ['places', 'routes'], // Ensure 'routes' library is loaded for Directions
      });

      loader.load().then(() => {
        if (!mapRef.current) return; // Double-check ref after async operation

        const newMap = new google.maps.Map(mapRef.current, {
          center: { lat: center[0], lng: center[1] }, // Use prop 'center' as initial center
          zoom: zoom, // Use prop 'zoom' as initial zoom
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: true,
        });
        mapInstanceRef.current = newMap;

        const newRenderer = new google.maps.DirectionsRenderer();
        newRenderer.setMap(newMap);
        directionsRendererRef.current = newRenderer;

        // If directionsResult is already available when map initializes, render them
        if (directionsResult && directionsRendererRef.current) {
          console.log("GoogleMap Initializing: Applying existing directionsResult");
          directionsRendererRef.current.setDirections(directionsResult);
        } else if (!directionsResult && mapInstanceRef.current) {
          // Add initial marker if no directions
          new google.maps.Marker({
            position: { lat: center[0], lng: center[1] },
            map: mapInstanceRef.current,
            title: 'Current Location',
          });
        }
      }).catch((error) => {
        console.error('Error loading Google Maps:', error);
      });
    }

    // Cleanup function for when isVisible becomes false or component unmounts
    return () => {
      // This cleanup runs if isVisible changes or component unmounts.
      // The logic at the start of the effect handles clearing refs if isVisible becomes false.
    };
  }, [isVisible, center, zoom, directionsResult]); // Added directionsResult to re-evaluate initial rendering if it changes while map is initializing

  // Effect to update directions on the map
  useEffect(() => {
    if (directionsRendererRef.current && mapInstanceRef.current) {
      if (directionsResult) {
        directionsRendererRef.current.setDirections(directionsResult);
      } else {
        // Clear previously rendered directions
        directionsRendererRef.current.setDirections(null);
        // Optionally reset map to center if directions are cleared
        mapInstanceRef.current.setCenter({ lat: center[0], lng: center[1] });
        mapInstanceRef.current.setZoom(zoom);
      }
    }
  }, [directionsResult, center, zoom]); // Depend on center/zoom for reset logic

  return (
    <div 
      ref={mapRef} 
      className="h-full w-full touch-manipulation"
      style={{
        WebkitOverflowScrolling: 'touch',
        touchAction: 'manipulation'
      }}
      aria-hidden="true"
      role="presentation"
    />
  );
};