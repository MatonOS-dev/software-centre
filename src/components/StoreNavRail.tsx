import { Button, Column, Row, Text, useMaterialColors } from "@expo/ui/jetpack-compose";
import { padding, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
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

function itemTextStyle(active: boolean) {
  if (active) return { typography: "titleSmall" as const };
  return { typography: "bodyMedium" as const };
}

function itemTint(active: boolean, primary: string, onSurfaceVariant: string): string {
  if (active) return primary;
  return onSurfaceVariant;
}

export function StoreNavRail({ page, updateCount, onSelect }: { page: StorePage; updateCount: number; onSelect: (page: StorePage) => void }) {
  const colors = useMaterialColors();
  const rows = items.map((item) => <Button key={item.page} onClick={() => onSelect(item.page)}>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }} modifiers={[padding(12, 12, 12, 12)]}>
      <MaterialSymbol name={item.symbol} tint={itemTint(page === item.page, colors.primary, colors.onSurfaceVariant)} />
      <Text style={itemTextStyle(page === item.page)}>{item.title}</Text>
      {updateCountBadge(item.page, updateCount, colors.primary)}
    </Row>
  </Button>);
  return <Column modifiers={[paddingAll(8)]} verticalArrangement={{ spacedBy: 6 }}>
    {rows}
  </Column>;
}
