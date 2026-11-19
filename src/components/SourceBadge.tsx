import { Text } from "@expo/ui/jetpack-compose";
import type { StoreApp } from "../sources/Source";

export function SourceBadge({ app }: { app: StoreApp }) {
  if (app.sourceUnavailable) return <Text style={{ typography: "bodySmall" }}>source unavailable</Text>;
  return <Text style={{ typography: "labelSmall" }}>{app.sourceLabel ?? app.source}</Text>;
}
