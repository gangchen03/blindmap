import { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface MapProps {
  center: [number, number];
  zoom: number;
  isVisible: boolean;
}

export const GoogleMap = ({ center, zoom, isVisible }: MapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.error('Google Maps API key is missing. Please check your .env file');
      return;
    }

    if (!mapRef.current || !isVisible) return;

    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places']
    });

    loader.load().then(() => {
      const map = new google.maps.Map(mapRef.current!, {
        center: { lat: center[0], lng: center[1] },
        zoom: zoom,
        disableDefaultUI: false, // Enable default UI for better mobile experience
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: true,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: true
      });
      mapInstanceRef.current = map;

      // Add current location marker
      new google.maps.Marker({
        position: { lat: center[0], lng: center[1] },
        map: map,
        title: 'Current Location'
      });
    }).catch((error) => {
      console.error('Error loading Google Maps:', error);
    });

    return () => {
      mapInstanceRef.current = null;
    };
  }, [center, zoom, isVisible]);

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