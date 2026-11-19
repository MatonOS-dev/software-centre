import { Column, Host, Shape, Surface, Text, useMaterialColors, type ShapeJSXElement } from "@expo/ui/jetpack-compose";
import { paddingAll, fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { MaterialSymbol } from "./MaterialSymbol";
import type { ReactNode } from "react";

export type StorePage = "browse" | "installed" | "updates" | "sources";
const items: Array<{ page: StorePage; title: string; symbol: string }> = [
  { page: "browse", title: "Explore", symbol: "explore" },
  { page: "installed", title: "Installed", symbol: "apps" },
  { page: "updates", title: "Updates", symbol: "system_update" },
  { page: "sources", title: "Sources", symbol: "inventory_2" },
];

function updateCountBadge(itemPage: StorePage, updateCount: number, color: string): ReactNode {
  if (itemPage !== "updates" || updateCount <= 0) return null;
  return <Text style={{ typography: "labelSmall" }} color={color}>{String(updateCount)}</Text>;
}

export function StoreNavRail({ page, updateCount, onSelect }: { page: StorePage; updateCount: number; onSelect: (page: StorePage) => void }) {
  const colors = useMaterialColors();
  const rows = items.map((item) => {
    const selected = page === item.page;
    const content = <Column horizontalAlignment="center" verticalArrangement={{ spacedBy: 4 }} modifiers={[paddingAll(8)]}>
      <Surface color={selected ? colors.secondaryContainer : "transparent"} contentColor={selected ? colors.onSecondaryContainer : colors.onSurfaceVariant} shape={<Shape.Pill /> as ShapeJSXElement}>
        <Host matchContents><MaterialSymbol name={item.symbol} tint={selected ? colors.onSecondaryContainer : colors.onSurfaceVariant} /></Host>
      </Surface>
      <Text style={{ typography: "labelMedium" }} color={selected ? colors.onSecondaryContainer : colors.onSurfaceVariant}>{item.title}</Text>
      {updateCountBadge(item.page, updateCount, selected ? colors.onSecondaryContainer : colors.onSurfaceVariant)}
    </Column>;
    return <Surface key={item.page} onClick={() => onSelect(item.page)} color="transparent" contentColor={colors.onSurfaceVariant} modifiers={[fillMaxWidth()]}>{content}</Surface>;
  });
  return <Host matchContents style={{ height: "100%" }}><Column modifiers={[paddingAll(8)]} verticalArrangement={{ spacedBy: 6 }}>
    {rows}
  </Column></Host>;
}
