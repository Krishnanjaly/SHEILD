import { useEffect } from "react";
import { VolumeManager } from "react-native-volume-manager";

export function useVolumeListener(
  enabled: boolean,
  onVolumeChange: (event: { volume?: number | null }) => void
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscription = VolumeManager.addVolumeListener((event) => {
      onVolumeChange(event);
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, onVolumeChange]);
}
