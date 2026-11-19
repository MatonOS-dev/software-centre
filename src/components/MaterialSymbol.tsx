import { useEffect, useState } from "react";
import { unstable_getMaterialSymbolSourceAsync, type AndroidSymbol } from "expo-symbols";
import type { ImageSourcePropType } from "react-native";
import { Icon, useMaterialColors } from "@expo/ui/jetpack-compose";

const resolved = new Map<string, ImageSourcePropType>();
const pending = new Map<string, Promise<ImageSourcePropType | null>>();

export function MaterialSymbol({ name, size = 22, tint, description }: { name: string; size?: number; tint?: string; description?: string }) {
  const colors = useMaterialColors();
  const [source, setSource] = useState<ImageSourcePropType | null>(resolved.get(name) ?? null);
  useEffect(() => {
    let active = true;
    if (!resolved.has(name)) {
      let request = pending.get(name);
      if (!request) {
        // Expo's Material Symbol source is rasterized from the MaterialSymbols font;
        // expo-symbols and expo-font are direct app dependencies so the font asset
        // is included in the release bundle instead of relying on transitive modules.
        request = unstable_getMaterialSymbolSourceAsync(name as AndroidSymbol, size, "#000000");
        pending.set(name, request);
      }
      void request.then((result) => {
        if (result) { resolved.set(name, result); if (active) setSource(result); return; }
        if (name !== "help") {
          let fallback = pending.get("help");
          if (!fallback) { fallback = unstable_getMaterialSymbolSourceAsync("help" as AndroidSymbol, size, "#000000"); pending.set("help", fallback); }
          void fallback.then((icon) => { if (icon) resolved.set(name, icon); if (active) setSource(icon); })
            .catch((error: unknown) => console.error(`Loading fallback badge icon for ${name} failed`, error));
        } else if (active) setSource(null);
      }).catch((error: unknown) => console.error(`Loading Material Symbol ${name} failed`, error));
    }
    return () => { active = false; };
  }, [name, size]);
  if (!source) return null;
  return <Icon source={source} size={size} tint={tint ?? colors.onSurfaceVariant} contentDescription={description ?? name} />;
}
