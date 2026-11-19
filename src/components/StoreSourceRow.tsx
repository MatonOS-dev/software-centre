import { Image as ComposeImage, Button, Column, Row, Switch, Text, useMaterialColors } from "@expo/ui/jetpack-compose";
import { paddingAll, size, weight } from "@expo/ui/jetpack-compose/modifiers";
import type { SourcePlugin } from "../../modules/matonos-software/src/MatonOS";
import { MaterialSymbol } from "./MaterialSymbol";

export function sourceTitle(plugin: SourcePlugin): string {
  if (plugin.package.includes("fdroid")) return "F-Droid · Android apps";
  if (plugin.package.includes("flatpak") || plugin.package === "org.matonos.linux") return "Flatpak · Linux apps";
  return plugin.label;
}

function sourceDescription(plugin: SourcePlugin): string {
  if (plugin.package.includes("fdroid")) return "Open source apps for the Android app platform.";
  if (plugin.package.includes("flatpak") || plugin.package === "org.matonos.linux") return "Desktop apps from Flatpak remotes.";
  return "Browse and manage apps from this source.";
}

export function StoreSourceRow({ plugin, icon, onSettings, onToggle }: { plugin: SourcePlugin; icon?: string | null; onSettings: () => void; onToggle: (enabled: boolean) => void }) {
  const colors = useMaterialColors();
  return <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 14 }} modifiers={[paddingAll(14)]}>
    {icon ? <ComposeImage source={{ uri: icon }} contentDescription={`${plugin.label} icon`} modifiers={[size(48, 48)]} /> : <MaterialSymbol name="deployed_code" size={42} />}
    <Column modifiers={[weight(1)]}>
      <Text style={{ typography: "titleMedium" }}>{sourceTitle(plugin)}</Text>
      <Text style={{ typography: "bodySmall" }} color={colors.onSurfaceVariant}>{sourceDescription(plugin)}</Text>
    </Column>
    <Button onClick={onSettings}><Text>Settings</Text></Button>
    <Switch value={plugin.enabled} onCheckedChange={onToggle} />
  </Row>;
}
