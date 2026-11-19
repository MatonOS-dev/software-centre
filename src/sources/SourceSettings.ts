export type SourceSetting = {
  id: string; label: string; type: "boolean" | "text" | "slider" | "group" | "action";
  value?: string; min?: number; max?: number; step?: number; readOnly?: boolean; removable?: boolean;
  children?: SourceSetting[]; fields?: SourceSetting[];
};

export function actionArguments(fields: SourceSetting[], values: Record<string, string>): string[] {
  return fields.map((field) => values[field.id] ?? "");
}

export function settingChildren(group: SourceSetting): SourceSetting[] {
  return group.type === "group" ? group.children ?? [] : [];
}
