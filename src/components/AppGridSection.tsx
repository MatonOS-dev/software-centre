import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@expo/ui/jetpack-compose";
import { paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";
import { Show } from "./Show";

export function AppGridSection({ title, apps, loading, error, renderApp }: {
  title: string; apps: StoreApp[]; loading: boolean; error?: string; renderApp: (app: StoreApp) => ReactNode;
}) {
  const rows = apps.map((app) => <View key={`${app.source}:${app.id}`} style={{ width: "100%" }}>{renderApp(app)}</View>);
  const showLoading = loading && apps.length === 0;
  const showEmpty = !loading && !error && apps.length === 0;
  return <View style={{ width: "100%", paddingHorizontal: 12, paddingTop: 12 }}>
    <Text style={{ typography: "titleLarge" }}>{title}</Text>
    <Show when={showLoading}><Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>Loading {title.toLowerCase()}…</Text></Show>
    <Show when={Boolean(error)}><Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>{error}</Text></Show>
    <Show when={showEmpty}><Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>No apps to show yet.</Text></Show>
    <View>{rows}</View>
  </View>;
}
