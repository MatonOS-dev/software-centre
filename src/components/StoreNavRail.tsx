import { Column, FilledTonalButton, Host, Row, Text, TextButton, useMaterialColors } from "@expo/ui/jetpack-compose";
import { fillMaxWidth, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
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

// Same pattern as MatonOS Settings NavItem: Icon + Text in one Row inside a button,
// all within the rail's single Host (a nested Host escapes the Compose layout).
function NavItem({ item, selected, updateCount, onSelect }: { item: (typeof items)[number]; selected: boolean; updateCount: number; onSelect: (page: StorePage) => void }) {
  const colors = useMaterialColors();
  const foreground = selected ? colors.onSecondaryContainer : colors.onSurfaceVariant;
  const content = <Row modifiers={[fillMaxWidth(), paddingAll(4)]} verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }}>
    <MaterialSymbol name={item.symbol} tint={foreground} description={item.title} />
    <Text style={{ typography: "labelLarge" }} color={foreground}>{item.title}</Text>
    {updateCountBadge(item.page, updateCount, foreground)}
  </Row>;
  const onClick = () => onSelect(item.page);
  if (selected) {
    return <FilledTonalButton onClick={onClick} colors={{ containerColor: colors.secondaryContainer, contentColor: colors.onSecondaryContainer }} modifiers={[fillMaxWidth()]}>{content}</FilledTonalButton>;
  }
  return <TextButton onClick={onClick} colors={{ contentColor: colors.onSurfaceVariant }} modifiers={[fillMaxWidth()]}>{content}</TextButton>;
}

export function StoreNavRail({ page, updateCount, onSelect }: { page: StorePage; updateCount: number; onSelect: (page: StorePage) => void }) {
  const rows = items.map((item) => <NavItem key={item.page} item={item} selected={page === item.page} updateCount={updateCount} onSelect={onSelect} />);
  return <Host style={{ width: 184, height: "100%" }}><Column modifiers={[paddingAll(12)]} verticalArrangement={{ spacedBy: 8 }}>
    {rows}
  </Column></Host>;
}
