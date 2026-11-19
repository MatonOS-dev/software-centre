import { Image as ComposeImage } from "@expo/ui/jetpack-compose";
import { size } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";

export function AppIcon({ app, imageSize }: { app: StoreApp; imageSize: number }) {
  if (!app.icon) return null;
  return <ComposeImage source={{ uri: app.icon }} contentDescription={`${app.name} icon`} modifiers={[size(imageSize, imageSize)]} />;
}
