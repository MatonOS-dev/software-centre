import { Host, LazyColumn, Text } from "@expo/ui/jetpack-compose";
import type { ReactNode } from "react";

export function SourcesScreen({ rows }: { rows: ReactNode[] }) {
  return <Host style={{ flex: 1 }}><LazyColumn contentPadding={{ start: 20, top: 18, end: 20, bottom: 20 }} verticalArrangement={{ spacedBy: 12 }}>
    <Text style={{ typography: "headlineSmall" }}>Sources</Text>
    <Text style={{ typography: "bodyMedium" }}>Choose which app catalogs Software Center searches.</Text>
    {rows}
  </LazyColumn></Host>;
}
