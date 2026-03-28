import React, { forwardRef } from 'react';
import MapView, { Marker, MapViewProps } from 'react-native-maps';

const MapComponent = forwardRef<MapView, MapViewProps & { children?: React.ReactNode }>((props, ref) => {
  return (
    <MapView ref={ref} {...props}>
      {props.children}
    </MapView>
  );
});

export { Marker };
export default MapComponent;
