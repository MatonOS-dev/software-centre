import { useEffect, useState } from "react";
import { Button, Column, Row, Text } from "@expo/ui/jetpack-compose";
import { paddingAll, weight } from "@expo/ui/jetpack-compose/modifiers";
import { MatonOS } from "../../modules/matonos-software/src/MatonOS";
import type { StoreApp } from "../sources/Source";
type PermissionRow = { icon: string; title: string; detail?: string; broad?: boolean };
import { MaterialSymbol } from "./MaterialSymbol";
import { Show } from "./Show";

type AndroidPermission = { name: string; label: string | null; group: string | null; groupLabel: string | null; dangerous: boolean };

function permissionIcon(label: string, group: string | null): string {
  const value = `${label} ${group ?? ""}`.toLowerCase();
  if (value.includes("camera")) return "photo_camera";
  if (value.includes("microphone")) return "mic";
  if (value.includes("location")) return "location_on";
  if (value.includes("contact")) return "contacts";
  if (value.includes("calendar")) return "calendar_month";
  if (value.includes("sms") || value.includes("phone")) return "call";
  if (value.includes("notification")) return "notifications";
  if (value.includes("nearby") || value.includes("bluetooth") || value.includes("wifi")) return "devices";
  if (value.includes("storage") || value.includes("media")) return "folder";
  return "security";
}

function GrantRow({ row }: { row: PermissionRow }) {
  return <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }} modifiers={[paddingAll(10)]}>
    <MaterialSymbol name={row.icon} />
    <Column modifiers={[weight(1)]}>
      <Text style={{ typography: "bodyLarge" }}>{row.title}</Text>
      <Show when={Boolean(row.detail)}><Text style={{ typography: "bodySmall" }}>{row.detail}</Text></Show>
    </Column>
    <Show when={Boolean(row.broad)}><Text style={{ typography: "labelSmall" }}>Broad access</Text></Show>
  </Row>;
}

function permissionDetail(permission: AndroidPermission): string | undefined {
  if (permission.dangerous) return "Runtime permission";
  return undefined;
}

function otherPermissionRows(permissions: AndroidPermission[], expanded: boolean) {
  if (!expanded) return [];
  return permissions.map((permission) => <GrantRow key={permission.name} row={{ icon: "info", title: permission.name }} />);
}

export function AndroidPermissionRows({ values }: { values: string[] }) {
  const [descriptions, setDescriptions] = useState<AndroidPermission[]>([]);
  const [otherExpanded, setOtherExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    void MatonOS.describeAndroidPermissions(values).then((json) => {
      if (active) setDescriptions(JSON.parse(json) as AndroidPermission[]);
    }).catch((error: unknown) => {
      console.error("Describing Android app permissions failed", error);
      if (active) setDescriptions(values.map((name) => ({ name, label: null, group: null, groupLabel: null, dangerous: false })));
    });
    return () => { active = false; };
  }, [values]);

  const defined = descriptions.filter((permission) => permission.label);
  const other = descriptions.filter((permission) => !permission.label);
  const groups = new Map<string, AndroidPermission[]>();
  for (const permission of defined) {
    const label = permission.groupLabel || permission.group || "Other permissions";
    const current = groups.get(label) ?? [];
    current.push(permission);
    groups.set(label, current);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const aDangerous = a[1].some((permission) => permission.dangerous);
    const bDangerous = b[1].some((permission) => permission.dangerous);
    return Number(bDangerous) - Number(aDangerous) || a[0].localeCompare(b[0]);
  });
  const groupRows = sortedGroups.map(([group, permissions]) => {
    const permissionRows = [...permissions].sort((a, b) => Number(b.dangerous) - Number(a.dangerous) || (a.label ?? a.name).localeCompare(b.label ?? b.name))
      .map((permission) => <GrantRow key={permission.name} row={{
        icon: permissionIcon(permission.label ?? permission.name, permission.group),
        title: permission.label ?? permission.name,
        detail: permissionDetail(permission),
      }} />);
    return <Column key={group}>
      <Text style={{ typography: "titleSmall" }} modifiers={[paddingAll(8)]}>{group}</Text>
      {permissionRows}
    </Column>;
  });
  const otherRows = otherPermissionRows(other, otherExpanded);
  const otherHeading = otherExpanded ? "⌃" : "⌄";

  return <Column>
    {groupRows}
    <Show when={other.length > 0}><Column>
      <Button onClick={() => setOtherExpanded((expanded) => !expanded)}>
        <Text>{`Other (${other.length}) app-defined permissions ${otherHeading}`}</Text>
      </Button>
      {otherRows}
    </Column></Show>
    <Show when={descriptions.length === 0}><Text style={{ typography: "bodyMedium" }}>No permissions are listed.</Text></Show>
  </Column>;
}

export function PermissionList({ app }: { app: StoreApp }) { return <AndroidPermissionRows values={app.permissions} />; }
