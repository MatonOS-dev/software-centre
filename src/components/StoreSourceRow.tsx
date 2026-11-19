import { Image as ComposeImage, Button, Column, Row, Switch, Text, useMaterialColors } from "@expo/ui/jetpack-compose";
import { paddingAll, size, weight } from "@expo/ui/jetpack-compose/modifiers";
import type { SourcePlugin } from "../../modules/matonos-software/src/MatonOS";
import { MaterialSymbol } from "./MaterialSymbol";

export function StoreSourceRow({ plugin, icon, onSettings, onToggle }: { plugin: SourcePlugin; icon?: string | null; onSettings: () => void; onToggle: (enabled: boolean) => void }) {
  const colors = useMaterialColors();
  return <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 14 }} modifiers={[paddingAll(14)]}>
    {icon ? <ComposeImage source={{ uri: icon }} contentDescription={`${plugin.label} icon`} modifiers={[size(48, 48)]} /> : <MaterialSymbol name="deployed_code" size={42} />}
    <Column modifiers={[weight(1)]}>
      <Text style={{ typography: "titleMedium" }}>{plugin.label}</Text>
      <Text style={{ typography: "bodySmall" }} color={colors.onSurfaceVariant}>{plugin.description ?? "Browse and manage apps from this source."}</Text>
    </Column>
    <Button onClick={onSettings}><Text>Settings</Text></Button>
    <Switch value={plugin.enabled} onCheckedChange={onToggle} />
  </Row>;
}
