import { Button, Column, Row, Text, useMaterialColors } from "@expo/ui/jetpack-compose";
import { padding, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { MaterialSymbol } from "./MaterialSymbol";

export type StorePage = "browse" | "installed" | "updates" | "sources";
const items: Array<{ page: StorePage; title: string; symbol: string }> = [
  { page: "browse", title: "Explore", symbol: "explore" },
  { page: "installed", title: "Installed", symbol: "apps" },
  { page: "updates", title: "Updates", symbol: "system_update" },
  { page: "sources", title: "Sources", symbol: "inventory_2" },
];

export function StoreNavRail({ page, updateCount, onSelect }: { page: StorePage; updateCount: number; onSelect: (page: StorePage) => void }) {
  const colors = useMaterialColors();
  const rows = items.map((item) => <Button key={item.page} onClick={() => onSelect(item.page)}>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }} modifiers={[padding(12, 12, 12, 12)]}>
      <MaterialSymbol name={item.symbol} tint={page === item.page ? colors.primary : colors.onSurfaceVariant} />
      <Text style={{ typography: page === item.page ? "titleSmall" : "bodyMedium" }}>{item.title}</Text>
      {item.page === "updates" && updateCount > 0 ? <Text style={{ typography: "labelSmall" }} color={colors.primary}>{String(updateCount)}</Text> : null}
    </Row>
  </Button>);
  return <Column modifiers={[paddingAll(8)]} verticalArrangement={{ spacedBy: 6 }}>
    {rows}
  </Column>;
}
