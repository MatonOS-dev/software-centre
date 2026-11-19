import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { AlertDialog, Button, Column, Host, LazyColumn, OutlinedTextField, Row, Slider, Switch, Text, useNativeState } from "@expo/ui/jetpack-compose";
import { padding, paddingAll, weight } from "@expo/ui/jetpack-compose/modifiers";
import { MatonOS } from "../../modules/matonos-software/src/MatonOS";
import { Show } from "../components/Show";
import { actionArguments, settingChildren, type SourceSetting } from "../sources/SourceSettings";


type ActionResult = { error?: string; confirmTitle?: string; confirmMessage?: string; launch?: boolean };
function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong."; }

function TextSetting({ setting, source, onError, reload, onDraft }: { setting: SourceSetting; source: string; onError: (error: string) => void; reload: () => void; onDraft?: (value: string) => void }) {
  const native = useNativeState(setting.value ?? "");
  useEffect(() => { native.set(setting.value ?? ""); }, [native, setting.value]);
  const save = async (value: string) => { try { const error = await MatonOS.sourceSetSetting(source, setting.id, value); if (error) onError(error); else reload(); } catch (error) { onError(errorText(error)); } };
  return <OutlinedTextField value={native} enabled={!setting.readOnly} singleLine keyboardOptions={{ imeAction: "done" }} onValueChange={(value) => { native.set(value); onDraft?.(value); }} keyboardActions={{ onDone: (value) => { if (!onDraft) void save(value); } }} modifiers={[padding(12, 4, 12, 4)]}><OutlinedTextField.Label>{setting.label}</OutlinedTextField.Label></OutlinedTextField>;
}

export function SourceSettingsScreen({ source, label, onBack }: { source: string; label: string; onBack: () => void }) {
  const [settings, setSettings] = useState<SourceSetting[]>([]); const [error, setError] = useState("");
  const [action, setAction] = useState<SourceSetting | null>(null); const [values, setValues] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ id: string; values: string[]; title: string; message: string } | null>(null);
  const reload = useCallback(async () => { try { setSettings(JSON.parse(await MatonOS.sourceSettings(source)) as SourceSetting[]); setError(""); } catch (failure) { setError(errorText(failure)); } }, [source]);
  useEffect(() => { let active = true; const load = () => { MatonOS.sourceSettings(source).then((json) => { if (active) { setSettings(JSON.parse(json) as SourceSetting[]); setError(""); } }).catch((failure: unknown) => { if (active) setError(errorText(failure)); }); }; load(); const subscription = AppState.addEventListener("change", (state) => { if (state === "active") load(); }); return () => { active = false; subscription.remove(); }; }, [source]);
  async function run(setting: SourceSetting, args: string[], confirmed = false) {
    try { const result = JSON.parse(await MatonOS.sourceRunAction(source, setting.id, args, confirmed)) as ActionResult;
      if (result.error) { setError(result.error); return; }
      if (result.confirmTitle && result.confirmMessage) { setConfirm({ id: setting.id, values: args, title: result.confirmTitle, message: result.confirmMessage }); return; }
      setAction(null); setConfirm(null); setValues({}); await reload();
    } catch (failure) { setError(errorText(failure)); }
  }
  async function change(setting: SourceSetting, value: string | null) {
    try { const failure = await MatonOS.sourceSetSetting(source, setting.id, value); if (failure) setError(failure); else await reload(); }
    catch (failure) { setError(errorText(failure)); }
  }
  const rows = settings.map((setting) => {
    if (setting.type === "boolean") return <Row key={setting.id} verticalAlignment="center" modifiers={[paddingAll(12)]}><Text modifiers={[weight(1)]}>{setting.label}</Text><Switch value={setting.value === "true"} onCheckedChange={(checked) => void change(setting, String(checked))} /></Row>;
    if (setting.type === "text") return <TextSetting key={setting.id} setting={setting} source={source} onError={setError} reload={reload} />;
    if (setting.type === "slider") { const value = Number(setting.value ?? setting.min ?? 0); return <Column key={setting.id} modifiers={[paddingAll(12)]}><Text>{setting.label}: {value}</Text><Slider value={value} min={setting.min ?? 0} max={setting.max ?? 1} steps={Math.max(0, Math.round(((setting.max ?? 1) - (setting.min ?? 0)) / (setting.step ?? 1)) - 1)} onValueChange={(next) => void change(setting, String(next))} /></Column>; }
    if (setting.type === "action") return <Button key={setting.id} onClick={() => { setAction(setting); setValues({}); }} modifiers={[paddingAll(8)]}><Text>{setting.label}</Text></Button>;
    if (setting.type === "group") { const children = settingChildren(setting).map((child) => child.type === "boolean" ? <Row key={child.id} verticalAlignment="center" modifiers={[paddingAll(8)]}><Text modifiers={[weight(1)]}>{child.label}</Text><Switch value={child.value === "true"} onCheckedChange={(checked) => void change(child, String(checked))} /></Row> : child.type === "action" ? <Button key={child.id} onClick={() => { setAction(child); setValues({}); }}><Text>{child.label}</Text></Button> : <Text key={child.id} style={{ typography: "bodySmall" }} modifiers={[paddingAll(8)]}>{child.label}: {child.value ?? ""}</Text>);
      return <Column key={setting.id} modifiers={[paddingAll(12)]}><Row verticalAlignment="center"><Text style={{ typography: "titleMedium" }} modifiers={[weight(1)]}>{setting.label}</Text><Show when={Boolean(setting.removable)}><Button onClick={() => void change(setting, null)}><Text>Remove</Text></Button></Show></Row>{children}</Column>; }
    return null;
  });
  const dialogFields = (action?.fields ?? []).map((field) => <TextSetting key={field.id} setting={{ ...field, value: values[field.id] ?? "" }} source={source} onError={setError} reload={() => undefined} onDraft={(value) => setValues((current) => ({ ...current, [field.id]: value }))} />);
  const dialogValues = actionArguments(action?.fields ?? [], values);
  return <Host style={{ flex: 1 }}><LazyColumn contentPadding={{ start: 20, top: 20, end: 20, bottom: 20 }} verticalArrangement={{ spacedBy: 12 }}>
    <Button onClick={onBack}><Text>‹  Back to sources</Text></Button><Text style={{ typography: "headlineSmall" }}>{label} settings</Text>{rows}<Show when={Boolean(error)}><Text>{error}</Text></Show>
    {actionDialog(action, dialogFields, () => setAction(null), () => { if (action) void run(action, dialogValues); })}
    {confirmationDialog(confirm, () => setConfirm(null), () => { const current = settings.find((entry) => entry.id === confirm?.id) ?? action; if (current && confirm) void run(current, confirm.values, true); })}
  </LazyColumn></Host>;
}

function actionDialog(action: SourceSetting | null, fields: ReactNode, dismiss: () => void, run: () => void) {
  if (!action) return null;
  return <AlertDialog onDismissRequest={dismiss}><AlertDialog.Title>{action.label}</AlertDialog.Title><AlertDialog.Text><Column verticalArrangement={{ spacedBy: 10 }}>{fields}</Column></AlertDialog.Text><AlertDialog.DismissButton><Button onClick={dismiss}><Text>Cancel</Text></Button></AlertDialog.DismissButton><AlertDialog.ConfirmButton><Button onClick={run}><Text>Continue</Text></Button></AlertDialog.ConfirmButton></AlertDialog>;
}

function confirmationDialog(confirm: { id: string; values: string[]; title: string; message: string } | null, dismiss: () => void, accept: () => void) {
  if (!confirm) return null;
  return <AlertDialog onDismissRequest={dismiss}><AlertDialog.Title>{confirm.title}</AlertDialog.Title><AlertDialog.Text>{confirm.message}</AlertDialog.Text><AlertDialog.DismissButton><Button onClick={dismiss}><Text>Cancel</Text></Button></AlertDialog.DismissButton><AlertDialog.ConfirmButton><Button onClick={accept}><Text>Trust</Text></Button></AlertDialog.ConfirmButton></AlertDialog>;
}
