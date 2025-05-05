export interface MapService {
  getDirections(origin: [number, number], destination: [number, number]): Promise<any>;
  geocode(address: string): Promise<[number, number]>;
  reverseGeocode(coords: [number, number]): Promise<string>;
}

export class GoogleMapService implements MapService {
  async getDirections(origin: [number, number], destination: [number, number]) {
    // Implementation for Google Maps directions
    return new Promise((resolve) => {
      const directionsService = new google.maps.DirectionsService();
      directionsService.route(
        {
          origin: { lat: origin[0], lng: origin[1] },
          destination: { lat: destination[0], lng: destination[1] },
          travelMode: google.maps.TravelMode.WALKING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK) {
            resolve(result);
          }
        }
      );
    });
  }

  async geocode(address: string): Promise<[number, number]> {
    // Implementation for Google Maps geocoding
    return new Promise((resolve, reject) => {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
          const location = results[0].geometry.location;
          resolve([location.lat(), location.lng()]);
        } else {
          reject(new Error('Geocoding failed'));
        }
      });
    });
  }

  async reverseGeocode(coords: [number, number]): Promise<string> {
    // Implementation for Google Maps reverse geocoding
    return new Promise((resolve, reject) => {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode(
        { location: { lat: coords[0], lng: coords[1] } },
        (results, status) => {
          if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
            resolve(results[0].formatted_address);
          } else {
            reject(new Error('Reverse geocoding failed'));
          }
        }
      );
    });
  }
}