import React, { forwardRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import MapView, { Marker, MapViewProps } from "react-native-maps";

type MapComponentProps = MapViewProps & { children?: React.ReactNode };

const hasGoogleMapsApiKey = Boolean(
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
    Constants.expoConfig?.extra?.googleMapsApiKey
);

const MapFallback = ({ style }: { style?: MapViewProps["style"] }) => (
  <View style={[style, styles.placeholder]}>
    <Text style={styles.title}>Map unavailable</Text>
    <Text style={styles.subtitle}>
      Add a Google Maps API key in Expo config to enable the Safe Map on Android.
    </Text>
  </View>
);

const MapComponent = forwardRef<MapView, MapComponentProps>((props, ref) => {
  if (Platform.OS === "android" && !hasGoogleMapsApiKey) {
    return <MapFallback style={props.style} />;
  }

  return (
    <MapView ref={ref} {...props}>
      {props.children}
    </MapView>
  );
});

export { Marker };
export default MapComponent;

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    color: "#EC1313",
    fontWeight: "700",
    fontSize: 18,
    textAlign: "center",
  },
  subtitle: {
    color: "#888",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
  },
});
