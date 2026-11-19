import { useState } from "react";
import { FlatList, View } from "react-native";
import { Image as ComposeImage, Button, Column, DropdownMenu, DropdownMenuItem, Host, LazyColumn, LinearProgressIndicator, Row, Text } from "@expo/ui/jetpack-compose";
import { height, padding, size, weight, width } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";
import { MaterialSymbol } from "../components/MaterialSymbol";
import { PermissionList } from "../components/PermissionList";

type Tab = "details" | "permissions";

function sizeLabel(value?: number): string {
  if (!value || value < 0) return "Not available";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(value / 1024)} KB`;
}

function screenshotItem(app: StoreApp, src: string, index: number) {
  return <Host key={`${app.id}-${index}`} style={{ width: 620, height: 349 }}>
    <ComposeImage source={{ uri: src }} contentDescription={`${app.name} screenshot`} modifiers={[width(620), height(349)]} />
  </Host>;
}

function ScreenshotStrip({ app }: { app: StoreApp }) {
  if (app.screenshots.length === 0) return null;
  const screenshots = app.screenshots.map((src, index) => screenshotItem(app, src, index));
  return <Column verticalArrangement={{ spacedBy: 8 }}>
    <Text style={{ typography: "titleMedium" }}>Screenshots</Text>
    <View style={{ height: 349 }}><FlatList removeClippedSubviews={false} horizontal data={screenshots} keyExtractor={(_, index) => `${app.id}-screenshot-${index}`} renderItem={({ item }) => item} /></View>
  </Column>;
}

function DetailFacts({ app }: { app: StoreApp }) {
  const refParts = app.ref.split("/");
  const branch = refParts.length > 3 ? refParts[3] : undefined;
  const rows = [
    ["App ID", app.id], ["Version", app.versionName], ["Download size", sizeLabel(app.downloadSize)],
    ["Installed size", sizeLabel(app.installedSize)], ["Branch", branch], ["Remote / repository", app.origin ?? app.repository],
    ["License", app.license], ["Homepage", app.homepage],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const elements = rows.map(([label, value]) => <Row key={label} verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }} modifiers={[padding(8, 10, 8, 10)]}>
    <Text style={{ typography: "labelLarge" }} modifiers={[weight(1)]}>{label}</Text>
    <Text style={{ typography: "bodyMedium" }}>{value}</Text>
  </Row>);
  return <Column>{elements}</Column>;
}

export function DetailScreen({ app, sources, installed, updateAvailable, busy, busyLabel, progress, percent, canCancel, error,
  onBack, onInstall, onRemove, onOpen, onCancel, onChooseSource }: {
  app: StoreApp; sources: StoreApp[]; installed: boolean; updateAvailable: boolean; busy: boolean; busyLabel: string;
  progress: string; percent: number | null; canCancel: boolean; error: string;
  onBack: () => void; onInstall: () => void; onRemove: () => void; onOpen: () => void; onCancel: () => void; onChooseSource: (app: StoreApp) => void;
}) {
  const [tab, setTab] = useState<Tab>("details");
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const actionLabel = busy ? busyLabel : updateAvailable ? "Update" : installed ? "Open" : "Install";
  const action = updateAvailable ? onInstall : installed ? onOpen : onInstall;
  const otherSources = sources.filter((candidate) => candidate.source !== app.source);
  const sourceItems = otherSources.map((candidate) => <DropdownMenuItem key={`${candidate.source}:${candidate.id}`} onClick={() => { setSourceMenuOpen(false); onChooseSource(candidate); }}>
    <DropdownMenuItem.Text>{candidate.sourceLabel ?? candidate.source}</DropdownMenuItem.Text>
  </DropdownMenuItem>);
  return <Host style={{ flex: 1 }}><LazyColumn contentPadding={{ start: 24, top: 20, end: 24, bottom: 24 }} verticalArrangement={{ spacedBy: 14 }}>
    <Button onClick={onBack}><Text>‹  Back</Text></Button>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 18 }}>
      {app.icon ? <ComposeImage source={{ uri: app.icon }} contentDescription={`${app.name} icon`} modifiers={[size(96, 96)]} /> : <MaterialSymbol name="apps" size={72} />}
      <Column modifiers={[weight(1)]} verticalArrangement={{ spacedBy: 4 }}>
        <Text style={{ typography: "headlineMedium" }}>{app.name}</Text>
        <Text style={{ typography: "bodyMedium" }}>{app.summary}</Text>
        <Text style={{ typography: "bodySmall" }}>{app.developer}</Text>
        <Text style={{ typography: "labelSmall" }}>{app.sourceLabel === "Flatpak" ? "Flathub" : app.sourceLabel ?? app.source}</Text>
      </Column>
    </Row>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 10 }}>
      <Button enabled={!busy} onClick={action}><Text>{actionLabel}</Text></Button>
      {installed ? <Button enabled={!busy} onClick={onRemove}><Text>Remove</Text></Button> : null}
      {otherSources.length ? <DropdownMenu expanded={sourceMenuOpen} onDismissRequest={() => setSourceMenuOpen(false)}>
        <DropdownMenu.Trigger><Button onClick={() => setSourceMenuOpen(true)}><Text>Also available from ▾</Text></Button></DropdownMenu.Trigger>
        <DropdownMenu.Items>{sourceItems}</DropdownMenu.Items>
      </DropdownMenu> : null}
    </Row>
    {progress ? <Column verticalArrangement={{ spacedBy: 6 }}>
      <LinearProgressIndicator progress={percent === null ? null : Math.min(1, Math.max(0, percent / 100))} />
      <Text style={{ typography: "bodySmall" }}>{progress}</Text>
      {busy && canCancel ? <Button onClick={onCancel}><Text>Cancel</Text></Button> : null}
    </Column> : null}
    {error ? <Text style={{ typography: "bodyMedium" }} color="#b3261e">{error}</Text> : null}
    <ScreenshotStrip app={app} />
    <Row horizontalArrangement={{ spacedBy: 8 }}>
      <Button onClick={() => setTab("details")}><Text>Details</Text></Button>
      <Button onClick={() => setTab("permissions")}><Text>Permissions</Text></Button>
    </Row>
    {tab === "permissions" ? <PermissionList app={app} /> : <Column verticalArrangement={{ spacedBy: 10 }}>
      <Text style={{ typography: "titleMedium" }}>About this app</Text>
      <Text style={{ typography: "bodyMedium" }}>{app.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || app.summary}</Text>
      <DetailFacts app={app} />
    </Column>}
  </LazyColumn></Host>;
}
