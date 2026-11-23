import { AlertDialog, Button, Column, Text } from "@expo/ui/jetpack-compose";

export function LocalBundleConfirmation({ fileName, sourceError, progress, onCancel, onInstall }: {
  fileName: string;
  sourceError: string;
  progress: string;
  onCancel: () => void;
  onInstall: () => void;
}) {
  const working = Boolean(progress);
  return <AlertDialog onDismissRequest={onCancel}>
    <AlertDialog.Title>Install local bundle</AlertDialog.Title>
    <AlertDialog.Text><Column verticalArrangement={{ spacedBy: 10 }}>
      <Text style={{ typography: "titleMedium" }}>{fileName}</Text>
      <Text>
      This file is from outside your configured software sources. Its source is unverified. Only install it if you trust where it came from; Flatpak will report whether the bundle is signed during installation.
      </Text>
      {sourceError ? <Text>{sourceError}</Text> : null}
      {progress ? <Text>{progress}</Text> : null}
    </Column></AlertDialog.Text>
    <AlertDialog.DismissButton><Button onClick={onCancel}><Text>{working ? "Cancel installation" : "Cancel"}</Text></Button></AlertDialog.DismissButton>
    <AlertDialog.ConfirmButton><Button onClick={onInstall} enabled={!sourceError && !working}><Text>Install anyway</Text></Button></AlertDialog.ConfirmButton>
  </AlertDialog>;
}
