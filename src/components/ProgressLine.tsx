import { Text } from "@expo/ui/jetpack-compose";

export function ProgressLine({ progress }: { progress: string }) {
  if (!progress) return null;
  return <Text style={{ typography: "bodyMedium" }} maxLines={2}>{progress}</Text>;
}
