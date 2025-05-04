import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapProps {
  center: [number, number];
  zoom: number;
  isVisible: boolean;
}

export const Map = ({ center, zoom, isVisible }: MapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || !isVisible) return;

    // 初始化地图
    const map = L.map(mapRef.current).setView(center, zoom);
    mapInstanceRef.current = map;

    // 添加OpenStreetMap图层
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 添加当前位置标记
    L.marker(center).addTo(map)
      .bindPopup('当前位置')
      .openPopup();

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [center, zoom, isVisible]);

  if (!isVisible) return null;

  return (
    <div 
      ref={mapRef} 
      style={{ height: '100vh', width: '100%' }}
      aria-hidden="true"
      role="presentation"
    />
  );
};