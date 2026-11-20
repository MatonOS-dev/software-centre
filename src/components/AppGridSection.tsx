import { View } from "react-native";
import { Column, Host, Text } from "@expo/ui/jetpack-compose";
import { paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";
import { Show } from "./Show";

export type AppSection = { title: string; data: StoreApp[]; loading: boolean; error?: string };

// Header of one Explore collection; the rows themselves are virtualized by the SectionList.
export function AppSectionHeader({ section }: { section: AppSection }) {
  const { title, data, loading, error } = section;
  const showLoading = loading && data.length === 0;
  const showEmpty = !loading && !error && data.length === 0;
  return <View style={{ width: "100%", paddingHorizontal: 12, paddingTop: 12 }}>
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}><Column>
      <Text style={{ typography: "titleLarge" }}>{title}</Text>
      <Show when={showLoading}><Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>Loading {title.toLowerCase()}…</Text></Show>
      <Show when={Boolean(error)}><Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>{error}</Text></Show>
      <Show when={showEmpty}><Text style={{ typography: "bodyMedium" }} modifiers={[paddingAll(12)]}>No apps to show yet.</Text></Show>
    </Column></Host>
  </View>;
}
