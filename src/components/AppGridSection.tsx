import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@expo/ui/jetpack-compose";
import { paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";

export function AppGridSection({ title, apps, loading, error, renderApp }: {
  title: string; apps: StoreApp[]; loading: boolean; error?: string; renderApp: (app: StoreApp) => ReactNode;
}) {
  const rows = apps.map((app) => <View key={`${app.source}:${app.id}`} style={{ width: "100%" }}>{renderApp(app)}</View>);
  return <View style={{ width: "100%", paddingHorizontal: 12, paddingTop: 12 }}>
    <Text style={{ typography: "titleLarge" }}>{title}</Text>
    {loading && apps.length === 0 ? <Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>Loading {title.toLowerCase()}…</Text> : null}
    {error ? <Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>{error}</Text> : null}
    {!loading && !error && apps.length === 0 ? <Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>No apps to show yet.</Text> : null}
    <View>{rows}</View>
  </View>;
}
