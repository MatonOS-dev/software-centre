import { Button, Column, Row, Text } from "@expo/ui/jetpack-compose";
import { clickable, padding, paddingAll, weight, width } from "@expo/ui/jetpack-compose/modifiers";
import type { ReactNode } from "react";
import type { StoreApp } from "../sources/Source";
import { MaterialSymbol } from "./MaterialSymbol";
import { AppIcon } from "./AppIcon";
import { Show } from "./Show";
import { SourceBadge } from "./SourceBadge";

export function busyButtonLabel(kind: "install" | "update" | "uninstall"): string {
  if (kind === "update") return "Updating…";
  return kind === "install" ? "Installing…" : "Working…";
}

export function progressLabel(phase: string, percent: number | null, bytesDone: number, bytesTotal: number): string {
  const fraction = percent == null ? "" : ` ${percent}%`;
  const size = bytesTotal > 0 ? ` · ${Math.floor(Math.max(0, bytesDone) / 1048576)} / ${Math.ceil(bytesTotal / 1048576)} MB` : "";
  return `${phase || "Working…"}${fraction}${size}`;
}

function ratingRow(app: StoreApp): ReactNode {
  if (!app.rating) return null;
  return <Text style={{ typography: "bodySmall" }}>{`★ ${app.rating.average.toFixed(1)} (${app.rating.count})`}</Text>;
}

function tileButtonLabel(app: StoreApp, busy: boolean, busyLabel: string, updateAvailable: boolean, installed: boolean): string {
  if (app.sourceUnavailable) return "Unavailable";
  if (busy) return busyLabel || "Working…";
  if (updateAvailable) return "Update";
  if (installed) return "Open";
  return "Install";
}

function tileButtonAction(app: StoreApp, updateAvailable: boolean, installed: boolean, onInstall: (app: StoreApp) => void, onLaunch: (app: StoreApp) => void): () => void {
  if (updateAvailable || !installed) return () => onInstall(app);
  return () => onLaunch(app);
}

// Busy rows only say what is happening; progress details live on the detail page.
function busyControl(isBusy: boolean, busy: boolean, sourceUnavailable: boolean, buttonAction: () => void, buttonLabel: string): ReactNode {
  if (isBusy) return <Text style={{ typography: "labelLarge" }}>{buttonLabel}</Text>;
  const buttonEnabled = !busy && !sourceUnavailable;
  return <Button enabled={buttonEnabled} onClick={buttonAction}><Text>{buttonLabel}</Text></Button>;
}

export function AppTile({ app, installed, updateAvailable, busy, busyLabel, error, onOpenDetails, onInstall, onLaunch }: {
  app: StoreApp;
  installed: boolean;
  updateAvailable: boolean;
  busy: boolean;
  busyLabel: string;
  progress: string;
  percent: number | null;
  error?: string;
  onOpenDetails: (app: StoreApp) => void;
  onInstall: (app: StoreApp) => void;
  onLaunch: (app: StoreApp) => void;
}) {
  const isBusy = busy;
  const buttonLabel = tileButtonLabel(app, isBusy, busyLabel, updateAvailable, installed);
  const buttonAction = tileButtonAction(app, updateAvailable, installed, onInstall, onLaunch);
  const badgeIcons = (app.badges ?? []).map((badge) => <MaterialSymbol key={badge.id} name={badge.icon || "verified"} description={badge.label} />);
  const modifiers = app.sourceUnavailable ? [] : [clickable(() => onOpenDetails(app))];
  const control = busyControl(isBusy, busy, Boolean(app.sourceUnavailable), buttonAction, buttonLabel);
  return (
    <Column modifiers={modifiers}>
      <Row verticalAlignment="center" modifiers={[paddingAll(12)]}>
        <AppIcon app={app} imageSize={48} />
        <Column modifiers={[weight(1), padding(12, 0, 12, 0)]}>
          <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 4 }}>
            <Text style={{ typography: "titleMedium" }} maxLines={1}>{app.name}</Text>
            {badgeIcons}
          </Row>
          <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
            <SourceBadge app={app} />
            {ratingRow(app)}
          </Row>
          <Text style={{ typography: "bodySmall" }} maxLines={1}>{app.summary}</Text>
        </Column>
        <Column modifiers={[width(112)]} verticalArrangement={{ spacedBy: 4 }}>
          {control}
          <Show when={Boolean(error)}><Text style={{ typography: "bodySmall" }} color="#b3261e">{error}</Text></Show>
        </Column>
      </Row>
    </Column>
  );
}

