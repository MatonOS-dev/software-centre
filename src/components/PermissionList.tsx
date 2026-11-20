import { useEffect, useState } from "react";
import { Button, Column, Row, Text } from "@expo/ui/jetpack-compose";
import { paddingAll, weight } from "@expo/ui/jetpack-compose/modifiers";
import { MatonOS } from "../../modules/matonos-software/src/MatonOS";
import type { StoreApp } from "../sources/Source";
type PermissionRow = { icon: string; title: string; detail?: string; broad?: boolean };
import { MaterialSymbol } from "./MaterialSymbol";
import { Show } from "./Show";

type AndroidPermission = { name: string; label: string | null; group: string | null; groupLabel: string | null; dangerous: boolean };

type PermissionKind = { group?: string; icon: string };

// Platform permissions by name. Since Android 10 the framework reports most
// runtime permissions in android.permission-group.UNDEFINED, so the user-facing
// group and icon come from this table instead of the package manager.
const platformKinds: Array<[RegExp, PermissionKind]> = [
  [/^RECORD_AUDIO$/, { group: "Microphone", icon: "mic" }],
  [/^CAMERA$/, { group: "Camera", icon: "photo_camera" }],
  [/LOCATION/, { group: "Location", icon: "location_on" }],
  [/CONTACTS|^GET_ACCOUNTS$/, { group: "Contacts", icon: "contacts" }],
  [/CALENDAR/, { group: "Calendar", icon: "calendar_month" }],
  [/SMS|MMS|WAP_PUSH/, { group: "SMS", icon: "sms" }],
  [/CALL_LOG/, { group: "Call logs", icon: "call_log" }],
  [/PHONE|CALL|VOICEMAIL|SIP/, { group: "Phone", icon: "call" }],
  [/^POST_NOTIFICATIONS$/, { group: "Notifications", icon: "notifications" }],
  [/^BLUETOOTH_(SCAN|CONNECT|ADVERTISE)$|^NEARBY_WIFI_DEVICES$|^UWB_RANGING$/, { group: "Nearby devices", icon: "devices" }],
  [/^READ_MEDIA_|EXTERNAL_STORAGE|^ACCESS_MEDIA_LOCATION$/, { group: "Photos and media", icon: "perm_media" }],
  [/^BODY_SENSORS/, { group: "Body sensors", icon: "monitor_heart" }],
  [/^ACTIVITY_RECOGNITION$/, { group: "Physical activity", icon: "directions_run" }],
  [/^INTERNET$/, { icon: "public" }],
  [/NETWORK_STATE|WIFI|CHANGE_NETWORK/, { icon: "wifi" }],
  [/BLUETOOTH/, { icon: "bluetooth" }],
  [/^NFC/, { icon: "nfc" }],
  [/^WAKE_LOCK$/, { icon: "coffee" }],
  [/^FOREGROUND_SERVICE/, { icon: "play_circle" }],
  [/^RECEIVE_BOOT_COMPLETED$/, { icon: "restart_alt" }],
  [/^VIBRATE$/, { icon: "vibration" }],
  [/INSTALL_PACKAGES|DELETE_PACKAGES/, { icon: "install_mobile" }],
  [/BIOMETRIC|FINGERPRINT/, { icon: "fingerprint" }],
  [/^SYSTEM_ALERT_WINDOW$/, { icon: "picture_in_picture" }],
  [/ALARM/, { icon: "alarm" }],
  [/AUDIO_SETTINGS/, { icon: "volume_up" }],
  [/WALLPAPER/, { icon: "wallpaper" }],
  [/SHORTCUT/, { icon: "add_to_home_screen" }],
  [/ACCOUNT|CREDENTIAL/, { icon: "account_circle" }],
  [/BATTERY|POWER/, { icon: "battery_full" }],
];

function permissionKind(name: string, label: string): PermissionKind {
  const local = name.startsWith("android.permission.") ? name.slice("android.permission.".length) : "";
  const match = platformKinds.find(([pattern]) => pattern.test(local));
  if (match) return match[1];
  const text = label.toLowerCase();
  if (text.includes("controller") || text.includes("game")) return { icon: "sports_esports" };
  if (text.includes("network") || text.includes("internet")) return { icon: "public" };
  return { icon: "shield" };
}

function groupHeading(permission: AndroidPermission): string {
  const kind = permissionKind(permission.name, permission.label ?? "");
  if (kind.group) return kind.group;
  const defined = permission.group && !permission.group.endsWith(".UNDEFINED");
  if (defined && permission.groupLabel) return permission.groupLabel;
  return "Other permissions";
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
    const label = groupHeading(permission);
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
        icon: permissionKind(permission.name, permission.label ?? "").icon,
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
