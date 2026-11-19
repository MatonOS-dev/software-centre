import type { ReactNode } from "react";
import { useEffect } from "react";
import { AlertDialog, Button, Column, Host, LazyColumn, OutlinedTextField, Row, Switch, Text, useNativeState } from "@expo/ui/jetpack-compose";
import { paddingAll, weight } from "@expo/ui/jetpack-compose/modifiers";
import { Show } from "../components/Show";

export type Repository = { id: string; url: string; label: string; official: boolean; broken: boolean; enabled?: boolean; appCount?: number; lastRefreshed?: number; builtIn?: boolean; removable?: boolean; description?: string };
export type RepoField = { id: string; label: string };

function repositoryStatus(repository: Repository): string {
  if (repository.broken) return "Broken: index verification or download failed.";
  return "Trusted repository";
}

function repositoryCount(repository: Repository): string {
  if (repository.appCount != null && repository.appCount >= 0) return `${repository.appCount} apps`;
  return "App count not available yet";
}

function repositoryRefresh(repository: Repository): string {
  if (repository.lastRefreshed) return `Last refreshed ${new Date(repository.lastRefreshed * 1000).toLocaleString()}`;
  return "Not refreshed yet";
}

function saveButtonLabel(checking: boolean): string {
  if (checking) return "Checking…";
  return "Trust and add";
}

function RepoAddField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (id: string, value: string) => void }) {
  const native = useNativeState(value);
  useEffect(() => { native.set(value); }, [native, value]);
  return <OutlinedTextField value={native} onValueChange={(next) => { native.set(next); onChange(id, next); }}><OutlinedTextField.Label>{label}</OutlinedTextField.Label></OutlinedTextField>;
}

function AddRepositoryDialog({ visible, repoNameInput, repoUrlInput, fields, fieldValues, setRepoName, setRepoUrl, setFieldValue, onDismiss, onReview }: {
  visible: boolean; repoNameInput: ReturnType<typeof useNativeState<string>>; repoUrlInput: ReturnType<typeof useNativeState<string>>;
  fields: RepoField[]; fieldValues: Record<string, string>; setRepoName: (value: string) => void; setRepoUrl: (value: string) => void;
  setFieldValue: (id: string, value: string) => void; onDismiss: () => void; onReview: () => void;
}) {
  const fieldRows = fields.map((field) => <RepoAddField key={field.id} id={field.id} label={field.label} value={fieldValues[field.id] ?? ""} onChange={setFieldValue} />);
  if (!visible) return null;
  return <AlertDialog onDismissRequest={onDismiss}>
    <AlertDialog.Title>Add repository</AlertDialog.Title>
    <AlertDialog.Text><Column verticalArrangement={{ spacedBy: 10 }}>
      <OutlinedTextField value={repoNameInput} onValueChange={setRepoName}><OutlinedTextField.Label>Repository name</OutlinedTextField.Label></OutlinedTextField>
      <OutlinedTextField value={repoUrlInput} onValueChange={setRepoUrl}><OutlinedTextField.Label>HTTPS repository URL</OutlinedTextField.Label></OutlinedTextField>
      {fieldRows}
    </Column></AlertDialog.Text>
    <AlertDialog.DismissButton><Button onClick={onDismiss}><Text>Cancel</Text></Button></AlertDialog.DismissButton>
    <AlertDialog.ConfirmButton><Button onClick={onReview}><Text>Review</Text></Button></AlertDialog.ConfirmButton>
  </AlertDialog>;
}

function RepositoryRow({ repository, supportsToggle, onToggle, onRemove }: { repository: Repository; supportsToggle: boolean; onToggle: (repository: Repository, enabled: boolean) => void; onRemove: (id: string) => void }) {
  const detailRows: ReactNode[] = [];
  if (repository.description) detailRows.push(<Text key="description" style={{ typography: "bodySmall" }}>{repository.description}</Text>);
  detailRows.push(<Text key="url" style={{ typography: "bodySmall" }}>{repository.url}</Text>);
  detailRows.push(<Text key="trust" style={{ typography: "bodySmall" }}>{repositoryStatus(repository)}</Text>);
  detailRows.push(<Text key="count" style={{ typography: "bodySmall" }}>{repositoryCount(repository)}</Text>);
  detailRows.push(<Text key="refresh" style={{ typography: "bodySmall" }}>{repositoryRefresh(repository)}</Text>);
  return <Column key={repository.id} modifiers={[paddingAll(10)]}>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 10 }}>
      <Column modifiers={[weight(1)]}><Text style={{ typography: "titleMedium" }}>{repository.label}</Text>{detailRows}</Column>
      <RepositoryToggle repository={repository} supportsToggle={supportsToggle} onToggle={onToggle} />
      <Show when={repository.removable !== false}><Button onClick={() => onRemove(repository.id)}><Text>Remove</Text></Button></Show>
    </Row>
  </Column>;
}

function RepositoryToggle({ repository, supportsToggle, onToggle }: { repository: Repository; supportsToggle: boolean; onToggle: (repository: Repository, enabled: boolean) => void }) {
  if (supportsToggle) return <Switch value={repository.enabled ?? true} onCheckedChange={(enabled) => onToggle(repository, enabled)} />;
  return <Text style={{ typography: "labelSmall" }}>Enabled</Text>;
}

function TrustRepositoryPanel({ host, fields, fieldValues, checking, onSave }: { host: string; fields: RepoField[]; fieldValues: Record<string, string>; checking: boolean; onSave: () => void }) {
  const valueRows = fields.map((field) => <Text key={field.id} style={{ typography: "bodySmall" }}>{field.label}: {fieldValues[field.id] ?? ""}</Text>);
  if (!host) return null;
  return <Column modifiers={[paddingAll(12)]}>
    <Text style={{ typography: "titleMedium" }}>Trust repository at {host}?</Text>
    {valueRows}
    <Text style={{ typography: "bodySmall" }}>Review the repository details before adding it.</Text>
    <Button enabled={!checking} onClick={onSave}><Text>{saveButtonLabel(checking)}</Text></Button>
  </Column>;
}

export function RepositoryManagerScreen({ repositories, revision, fields, fieldValues, error, host, checking, adding, repoNameInput, repoUrlInput, onBack, onAdd, onDismissAdd, onReviewAdd, onSetField, onSetName, onSetUrl, onToggle, onRemove, onSave }: {
  repositories: Repository[]; revision: number; fields: RepoField[]; fieldValues: Record<string, string>; error: string; host: string; checking: boolean; adding: boolean;
  repoNameInput: ReturnType<typeof useNativeState<string>>; repoUrlInput: ReturnType<typeof useNativeState<string>>;
  onBack: () => void; onAdd: () => void; onDismissAdd: () => void; onReviewAdd: () => void; onSetField: (id: string, value: string) => void;
  onSetName: (value: string) => void; onSetUrl: (value: string) => void; onToggle: (repository: Repository, enabled: boolean) => void; onRemove: (id: string) => void; onSave: () => void;
}) {
  const repositoryRows = repositories.map((repository) => <RepositoryRow key={repository.id} repository={repository} supportsToggle={revision >= 5} onToggle={onToggle} onRemove={onRemove} />);
  return <Host style={{ flex: 1 }}><LazyColumn contentPadding={{ start: 20, top: 20, end: 20, bottom: 20 }} verticalArrangement={{ spacedBy: 12 }}>
    <Button onClick={onBack}><Text>‹  Back to sources</Text></Button>
    <Text style={{ typography: "headlineSmall" }}>Repositories</Text>
    <Text style={{ typography: "bodyMedium" }}>Review repository details before adding a source repository.</Text>
    {repositoryRows}
    <Button onClick={onAdd}><Text>Add repository</Text></Button>
    <AddRepositoryDialog visible={adding} repoNameInput={repoNameInput} repoUrlInput={repoUrlInput} fields={fields} fieldValues={fieldValues} setRepoName={onSetName} setRepoUrl={onSetUrl} setFieldValue={onSetField} onDismiss={onDismissAdd} onReview={onReviewAdd} />
    <TrustRepositoryPanel host={host} fields={fields} fieldValues={fieldValues} checking={checking} onSave={onSave} />
    <Show when={Boolean(error)}><Text style={{ typography: "bodyMedium" }}>{error}</Text></Show>
  </LazyColumn></Host>;
}
