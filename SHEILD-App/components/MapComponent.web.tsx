import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const MapComponent = forwardRef<any, any>((props, ref) => {
  return (
    <View style={[props.style, styles.webPlaceholder]}>
      <Text style={styles.webText}>Maps are not supported on web yet.</Text>
      <Text style={styles.webSub}>Please use a real device or emulator to view the Safe Map.</Text>
    </View>
  );
});

export const Marker = () => null;
export default MapComponent;

const styles = StyleSheet.create({
  webPlaceholder: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  webText: {
    color: '#EC1313',
    fontWeight: 'bold',
    fontSize: 18,
    textAlign: 'center',
  },
  webSub: {
    color: '#888',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
});
