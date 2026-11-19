import { Image as ComposeImage, Card, Column, Row, Text, useMaterialColors } from "@expo/ui/jetpack-compose";
import { clickable, paddingAll, size, weight } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";
import { MaterialSymbol } from "./MaterialSymbol";

export function StoreAppCard({ app, installed, onOpen }: { app: StoreApp; installed: boolean; onOpen: (app: StoreApp) => void }) {
  const colors = useMaterialColors();
  const source = app.sourceLabel === "Flatpak" ? "Flathub" : app.sourceLabel ?? app.source;
  return <Card colors={{ containerColor: colors.surfaceContainerLow, contentColor: colors.onSurface }} modifiers={[clickable(() => onOpen(app))]}>
    <Column modifiers={[paddingAll(16)]} verticalArrangement={{ spacedBy: 10 }}>
      <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }}>
        {app.icon ? <ComposeImage source={{ uri: app.icon }} contentDescription={`${app.name} icon`} modifiers={[size(64, 64)]} /> : <MaterialSymbol name="apps" size={48} />}
        <Column modifiers={[weight(1)]}>
          <Text style={{ typography: "titleMedium" }} maxLines={1}>{app.name}</Text>
          <Text style={{ typography: "bodySmall" }} maxLines={1}>{source}</Text>
        </Column>
        {installed ? <MaterialSymbol name="check_circle" tint="#2e7d32" description="Installed" /> : null}
      </Row>
      <Text style={{ typography: "bodyMedium" }} maxLines={1}>{app.summary}</Text>
      {app.rating ? <Text style={{ typography: "bodySmall" }}>{`${app.rating.average.toFixed(1)} / 5 · ${app.rating.count} ratings`}</Text> : null}
    </Column>
  </Card>;
}
