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
        request = unstable_getMaterialSymbolSourceAsync(name as AndroidSymbol, size, "#000000");
        pending.set(name, request);
      }
      void request.then((result) => {
        if (result) resolved.set(name, result);
        if (active) setSource(result);
      }).catch((error: unknown) => console.error(`Loading Material Symbol ${name} failed`, error));
    }
    return () => { active = false; };
  }, [name, size]);
  if (!source) return null;
  return <Icon source={source} size={size} tint={tint ?? colors.onSurfaceVariant} contentDescription={description ?? name} />;
}
