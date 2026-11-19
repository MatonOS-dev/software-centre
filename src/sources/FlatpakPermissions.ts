export type PermissionRow = {
  icon: string;
  title: string;
  detail?: string;
  broad?: boolean;
};

const folderNames: Record<string, string> = {
  home: "Home folder",
  host: "Entire host filesystem",
  "host-os": "Host operating system files",
  "host-etc": "Host configuration files",
  "host-root": "Host root filesystem",
  "xdg-download": "Downloads",
  "xdg-documents": "Documents",
  "xdg-pictures": "Pictures",
  "xdg-videos": "Videos",
  "xdg-music": "Music",
  "xdg-desktop": "Desktop",
  "xdg-config": "App configuration files",
  "xdg-cache": "App cache files",
  "xdg-data": "App data files",
  "xdg-run": "Session runtime files",
  "xdg-state": "App state files",
};

function splitGrant(value: string): string[] {
  return value.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
}

function fileRow(token: string): PermissionRow {
  const negated = token.startsWith("!");
  const raw = negated ? token.slice(1) : token;
  const [path, mode] = raw.split(":", 2);
  const knownName = folderNames[path] ?? folderNames[path.split("/")[0]];
  const pathLabel = knownName && !path.includes("/") ? knownName : path;
  const title = `${negated ? "Not " : ""}Files: ${pathLabel}`;
  const access = mode === "ro" ? "read only" : mode === "create" ? "create" : "read and write";
  const detail = knownName ? `${access} · ${knownName}` : access;
  return { icon: "folder", title, detail, broad: path === "home" || path === "host" || path === "host-root" };
}

function busRow(section: string, name: string, access: string): PermissionRow {
  const negated = access.startsWith("not ");
  const mode = negated ? access.slice(4) : access;
  const action = negated ? "Does not have" : mode === "talk" ? "Talks to" : mode === "own" ? "Owns" : mode === "see" ? "Can see" : `${mode} on`;
  const familiar: Record<string, string> = {
    "org.kde.StatusNotifierWatcher": "system tray",
    "org.freedesktop.Notifications": "desktop notifications",
    "org.freedesktop.portal.Desktop": "desktop portals",
    "org.freedesktop.Flatpak": "Flatpak service",
  };
  const isSystem = section === "[System Bus Policy]";
  return {
    icon: "hub",
    title: `${action} ${familiar[name] ? `${familiar[name]} (${name})` : name}`,
    detail: isSystem ? "System bus" : undefined,
    broad: isSystem,
  };
}

/** Turns flatpak-builder metadata lines into one readable row per grant. */
export function formatFlatpakPermissions(values: string[]): PermissionRow[] {
  const rows: PermissionRow[] = [];
  for (const rawLine of values) {
    const line = rawLine.trim();
    const match = line.match(/^(\[[^\]]+\])\s*([^=\s]+)\s*=\s*(.*)$/);
    if (!match) {
      if (line) rows.push({ icon: "info", title: line });
      continue;
    }
    const [, section, key, value] = match;
    const tokens = splitGrant(value);
    if (key === "shared") {
      for (const token of tokens) {
        const negative = token.startsWith("!");
        const grant = negative ? token.slice(1) : token;
        const labels: Record<string, string> = { network: "Network access", ipc: "IPC sharing" };
        rows.push({ icon: grant === "network" ? "language" : "hub", title: `${negative ? "Not " : ""}${labels[grant] ?? token}` });
      }
    } else if (key === "sockets") {
      const display: string[] = [];
      for (const token of tokens) {
        if (token.startsWith("if:")) {
          const [, grant, condition] = token.split(":");
          const grantLabel = grant === "x11" ? "X11 display access" : grant === "wayland" ? "Wayland display access" : grant;
          const conditionLabel = condition === "!has-wayland" ? "Wayland is not available" : condition === "has-wayland" ? "Wayland is available" : condition.replace(/^!/, "not ");
          rows.push({ icon: "desktop_windows", title: `Conditional ${grantLabel}`, detail: `When ${conditionLabel}`, broad: grant === "x11" });
          continue;
        }
        const negative = token.startsWith("!");
        const grant = negative ? token.slice(1) : token;
        const labels: Record<string, string> = { wayland: "Wayland", x11: "X11", pulseaudio: "PulseAudio", pipewire: "PipeWire", "session-bus": "session bus", "system-bus": "system bus" };
        if (grant === "wayland" || grant === "x11") display.push(`${negative ? "not " : ""}${labels[grant]}`);
        else if (labels[grant]) rows.push({ icon: grant.includes("audio") || grant === "pipewire" ? "volume_up" : "hub", title: `${negative ? "Not " : ""}${labels[grant]} access`, broad: grant === "system-bus" });
        else rows.push({ icon: "info", title: token });
      }
      if (display.length) rows.push({ icon: "desktop_windows", title: `Display: ${display.join(", ")}`, broad: tokens.some((token) => token.replace(/^!/, "") === "x11") });
    } else if (key === "devices") {
      for (const token of tokens) {
        const negative = token.startsWith("!");
        const grant = negative ? token.slice(1) : token;
        const labels: Record<string, string> = { all: "All devices (incl. GPU)", dri: "GPU access", input: "Input devices", usb: "USB devices", kvm: "Virtual machine devices" };
        rows.push({ icon: grant === "dri" || grant === "all" ? "memory" : "devices", title: `${negative ? "Not " : ""}${labels[grant] ?? token}`, broad: grant === "all" });
      }
    } else if (key === "filesystems") {
      for (const token of tokens) rows.push(fileRow(token));
    } else if (key === "persistent") {
      for (const token of tokens) rows.push({ icon: "folder", title: `Keeps data: ${folderNames[token] ?? token}` });
    } else if (key === "features") {
      const labels: Record<string, string> = { devel: "Development tools", multiarch: "32-bit compatibility", "per-app-dev-shm": "Private shared memory", bluetooth: "Bluetooth access", canbus: "CAN bus access" };
      for (const token of tokens) {
        const condition = token.replace(/^!/, "");
        const title = condition === "has-input-device" && token.startsWith("!") ? "Condition: no input device is present" : labels[condition] ? `${token.startsWith("!") ? "Not " : ""}${labels[condition]}` : token;
        rows.push({ icon: "memory", title });
      }
    } else if (key === "environment" || key === "unset-environment") {
      if (tokens.length) rows.push({ icon: "tune", title: "Environment changes", detail: tokens.join(", ") });
    } else if (section.endsWith("Bus Policy]")) {
      for (const token of tokens) rows.push(busRow(section, key, token.startsWith("!") ? `not ${token.slice(1)}` : token));
    } else {
      rows.push({ icon: "info", title: `${section} ${key}=${value}` });
    }
  }
  return rows;
}
