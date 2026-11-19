import { useWindowDimensions, View } from "react-native";
import { Text } from "@expo/ui/jetpack-compose";
import { paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";
import { StoreAppCard } from "./StoreAppCard";

function columnCount(width: number): number {
  if (width >= 1100) return 3;
  if (width >= 650) return 2;
  return 1;
}

export function AppGridSection({ title, apps, installed, onOpen, loading, error }: {
  title: string; apps: StoreApp[]; installed: Set<string>; onOpen: (app: StoreApp) => void; loading: boolean; error?: string;
}) {
  const { width } = useWindowDimensions();
  const columns = columnCount(width);
  const cards = apps.map((app) => <View key={`${app.source}:${app.id}`} style={{ width: `${100 / columns}%`, padding: 8 }}>
    <StoreAppCard app={app} installed={installed.has(`${app.source}:${app.id}`)} onOpen={onOpen} />
  </View>);
  return <View style={{ width: "100%", paddingHorizontal: 12, paddingTop: 12 }}>
    <Text style={{ typography: "titleLarge" }}>{title}</Text>
    {loading && apps.length === 0 ? <Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>Loading {title.toLowerCase()}…</Text> : null}
    {error ? <Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>{error}</Text> : null}
    {!loading && !error && apps.length === 0 ? <Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>No apps to show yet.</Text> : null}
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{cards}</View>
  </View>;
}
