import { Column, Host, Row, Shape, Surface, Text, useMaterialColors, type ShapeJSXElement } from "@expo/ui/jetpack-compose";
import { paddingAll, fillMaxWidth, weight } from "@expo/ui/jetpack-compose/modifiers";
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
    const foreground = selected ? colors.onSecondaryContainer : colors.onSurfaceVariant;
    const content = <Surface color={selected ? colors.secondaryContainer : "transparent"} contentColor={foreground} shape={<Shape.Pill /> as ShapeJSXElement} modifiers={[fillMaxWidth()]}>
      <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 10 }} modifiers={[paddingAll(10)]}>
        <Host matchContents><MaterialSymbol name={item.symbol} tint={foreground} /></Host>
        <Text modifiers={[weight(1)]} style={{ typography: "labelMedium" }} color={foreground}>{item.title}</Text>
        {updateCountBadge(item.page, updateCount, foreground)}
      </Row>
    </Surface>;
    return <Surface key={item.page} onClick={() => onSelect(item.page)} color="transparent" contentColor={foreground} modifiers={[fillMaxWidth()]}>{content}</Surface>;
  });
  return <Host style={{ width: 144, height: "100%" }}><Column modifiers={[paddingAll(12)]} verticalArrangement={{ spacedBy: 8 }}>
    {rows}
  </Column></Host>;
}
