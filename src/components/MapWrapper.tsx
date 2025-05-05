import { Map } from './Map';
import { GoogleMap } from './GoogleMap';
import { MapProvider, useMapProvider } from '../contexts/MapContext';

interface MapWrapperProps {
  center: [number, number];
  zoom: number;
  isVisible: boolean;
}

export const MapWrapper = (props: MapWrapperProps) => {
  const { provider } = useMapProvider();

  return provider === MapProvider.GOOGLE ? (
    <GoogleMap {...props} />
  ) : (
    <Map {...props} />
  );
};