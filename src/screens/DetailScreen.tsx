import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { FlatList, View } from "react-native";
import { Image as ComposeImage, Button, Column, DropdownMenu, DropdownMenuItem, Host, LinearProgressIndicator, OutlinedTextField, Row, Text, useMaterialColors, useNativeState } from "@expo/ui/jetpack-compose";
import { height, padding, size, weight, width } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";
import { MaterialSymbol } from "../components/MaterialSymbol";
import { PermissionList } from "../components/PermissionList";
import { Show } from "../components/Show";
import { RatingStars, StarRow } from "./RatingStars";
import { appRatingKey, fetchReviews, type OwnedReview } from "../sources/ratings";
import type { Review } from "../sources/Source";
import { canSubmitReview, reviewErrorMessage } from "./reviewFormState";

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

function repositoryOptionLabel(option: NonNullable<StoreApp["repoOptions"]>[number], selectedRepo: string | undefined): string {
  let label = `${option.name}${option.version ? ` · ${option.version}` : ""}`;
  if (option.repoId === selectedRepo) label += " ✓";
  if (!option.installable && option.note) label += ` — ${option.note}`;
  return label;
}

function DetailAppIcon({ app }: { app: StoreApp }) {
  if (app.icon) return <ComposeImage source={{ uri: app.icon }} contentDescription={`${app.name} icon`} modifiers={[size(96, 96)]} />;
  return <MaterialSymbol name="apps" size={72} />;
}

function RemoveButton({ installed, busy, onRemove }: { installed: boolean; busy: boolean; onRemove: () => void }) {
  if (!installed) return null;
  return <Button enabled={!busy} onClick={onRemove}><Text>Remove</Text></Button>;
}

function RepositoryMenu({ options, selectedRepository, expanded, setExpanded, onChoose }: {
  options: NonNullable<StoreApp["repoOptions"]>; selectedRepository: NonNullable<StoreApp["repoOptions"]>[number] | undefined;
  expanded: boolean; setExpanded: (value: boolean) => void; onChoose: (repoId: string) => void;
}) {
  if (options.length <= 1) return null;
  const items = options.map((option) => <DropdownMenuItem key={option.repoId} onClick={() => { setExpanded(false); onChoose(option.repoId); }}>
    <DropdownMenuItem.Text>{repositoryOptionLabel(option, selectedRepository?.repoId)}</DropdownMenuItem.Text>
  </DropdownMenuItem>);
  return <DropdownMenu expanded={expanded} onDismissRequest={() => setExpanded(false)}>
    <DropdownMenu.Trigger><Button onClick={() => setExpanded(true)}><Text>{`${selectedRepository?.name ?? "Choose repository"} ▾`}</Text></Button></DropdownMenu.Trigger>
    <DropdownMenu.Items>{items}</DropdownMenu.Items>
  </DropdownMenu>;
}

function selectedRepositoryNote(note: string | undefined) {
  if (!note) return null;
  return <Text style={{ typography: "bodySmall" }}>{note}</Text>;
}

function progressPanel(progress: string, percent: number | null, busy: boolean, canCancel: boolean, onCancel: () => void) {
  if (!progress) return null;
  const ratio = percent === null ? null : Math.min(1, Math.max(0, percent / 100));
  return <Column verticalArrangement={{ spacedBy: 6 }}>
    <LinearProgressIndicator progress={ratio} />
    <Text style={{ typography: "bodySmall" }}>{progress}</Text>
    <Show when={busy && canCancel}><Button onClick={onCancel}><Text>Cancel</Text></Button></Show>
  </Column>;
}

function tabHeader(tab: Tab, app: StoreApp) {
  if (tab === "permissions") return <PermissionList app={app} />;
  return <Text style={{ typography: "titleMedium" }}>About this app</Text>;
}

function tabDetails(tab: Tab, markdown: string, colors: ReturnType<typeof useMaterialColors>, openLink: (event: { url: string }) => void) {
  if (tab !== "details") return null;
  return <EnrichedMarkdownText markdown={markdown} flavor="commonmark" selectable onLinkPress={openLink}
    markdownStyle={{ paragraph: { fontSize: 14, color: colors.onSurface, lineHeight: 21, marginBottom: 12 },
      h1: { color: colors.onSurface }, h2: { color: colors.onSurface }, h3: { color: colors.onSurface },
      list: { color: colors.onSurface, itemSpacing: 5 }, link: { color: colors.primary } }} />;
}

function tabFacts(tab: Tab, app: StoreApp) {
  if (tab !== "details") return null;
  return <Host matchContents={{ vertical: true }} style={{ width: "100%" }}><DetailFacts app={app} /></Host>;
}

function actionButtonLabel(busy: boolean, busyLabel: string, updateAvailable: boolean, installed: boolean): string {
  if (busy) return busyLabel;
  if (updateAvailable) return "Update";
  if (installed) return "Open";
  return "Install";
}

function actionHandler(updateAvailable: boolean, installed: boolean, onInstall: () => void, onOpen: () => void): () => void {
  if (updateAvailable || !installed) return onInstall;
  return onOpen;
}

function ScreenshotStrip({ app }: { app: StoreApp }) {
  if (app.screenshots.length === 0) return null;
  const screenshots = app.screenshots.map((src, index) => screenshotItem(app, src, index));
  return <Column verticalArrangement={{ spacedBy: 8 }}>
    <Text style={{ typography: "titleMedium" }}>Screenshots</Text>
    <View style={{ height: 349 }}><FlatList removeClippedSubviews={false} horizontal data={screenshots} keyExtractor={(_, index) => `${app.id}-screenshot-${index}`} renderItem={({ item }) => item} /></View>
  </Column>;
}

function ReviewCard({ review }: { review: Review }) {
  return <Column verticalArrangement={{spacedBy:4}} modifiers={[padding(12,8,12,8)]}>
    <Text style={{typography:"titleSmall"}}>{`${"★".repeat(review.rating)}${"☆".repeat(5-review.rating)}  ${review.author}`}</Text>
    <Show when={Boolean(review.summary)}><Text style={{typography:"titleMedium"}}>{review.summary}</Text></Show>
    <Text style={{typography:"bodyMedium"}}>{review.description}</Text>
    <Text style={{typography:"bodySmall"}}>{review.date.toLocaleDateString()}</Text>
  </Column>;
}

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <Text style={{typography:"bodySmall"}} color="#b3261e">{message}</Text>;
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

export function DetailScreen({ app, installed, updateAvailable, busy, busyLabel, progress, percent, canCancel, error, onRate,
  onSignIn, onSubmitReview, onDeleteReview, onBack, onInstall, onRemove, onOpen, onCancel, onChooseRepository }: {
  app: StoreApp; installed: boolean; updateAvailable: boolean; busy: boolean; busyLabel: string;
  progress: string; percent: number | null; canCancel: boolean; error: string; onRate: (stars: number) => Promise<void>;
  onSignIn: () => Promise<OwnedReview | null>;
  onSubmitReview: (stars:number,title:string,body:string) => Promise<void>; onDeleteReview: () => Promise<void>;
  onBack: () => void; onInstall: () => void; onRemove: () => void; onOpen: () => void; onCancel: () => void; onChooseRepository: (repoId: string) => void;
}) {
  const colors = useMaterialColors();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewError, setReviewError] = useState("");
  const [myReview, setMyReview] = useState<OwnedReview | null>(null);
  const [reviewAccountKey, setReviewAccountKey] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewStars, setReviewStars] = useState(5);
  const titleNative = useNativeState("");
  const bodyNative = useNativeState("");
  const offset = useRef(0);
  const loadingReviews = useRef(false);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  // Keyed on the rating key, not the app object: the object is rebuilt on re-renders, which
  // would restart the request and drop its result.
  const reviewKey = appRatingKey(app);
  useEffect(() => {
    let active = true; offset.current = 0;
    void fetchReviews(app, 0, 20).then((items) => { if (active) { setReviews(items); offset.current = items.length; setHasMoreReviews(items.length === 20); } })
      .catch((cause) => { if (active) setReviewError(cause instanceof Error ? cause.message : "Reviews could not be loaded."); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewKey]);
  async function loadMoreReviews() {
    if (loadingReviews.current || !hasMoreReviews) return;
    loadingReviews.current = true;
    try { const items = await fetchReviews(app, offset.current, 20); setReviews((current) => [...current, ...items]); offset.current += items.length; setHasMoreReviews(items.length === 20); }
    catch (cause) { setReviewError(cause instanceof Error ? cause.message : "More reviews could not be loaded."); }
    finally { loadingReviews.current = false; }
  }
  async function sendReview() {
    const draft = {stars:reviewStars,title:titleNative.value,body:bodyNative.value};
    if (!canSubmitReview(draft)) { setReviewError("Add a title or review and check the length limits."); return; }
    setReviewBusy(true); setReviewError("");
    try { await onSubmitReview(draft.stars,draft.title,draft.body); setMyReview(draft); const next = await fetchReviews(app, 0, 20); setReviews(next); offset.current = next.length; }
    catch (cause) { const value = cause as Error & { code?:string }; setReviewError(reviewErrorMessage(value.code,value.message)); }
    finally { setReviewBusy(false); }
  }
  async function removeOwnReview() {
    setReviewBusy(true); setReviewError("");
    try { await onDeleteReview(); setMyReview(null); titleNative.set(""); bodyNative.set(""); setReviews(await fetchReviews(app,0,20)); }
    catch (cause) { setReviewError(cause instanceof Error ? cause.message : "Review could not be deleted."); }
    finally { setReviewBusy(false); }
  }
  async function signInForReview() {
    setReviewBusy(true); setReviewError("");
    try { const own = await onSignIn(); setMyReview(own); if (own) { setReviewStars(own.stars); titleNative.set(own.title); bodyNative.set(own.body); } setReviewAccountKey(app.ref); }
    catch (cause) { setReviewError(cause instanceof Error ? cause.message : "Sign-in was not completed."); }
    finally { setReviewBusy(false); }
  }
  const reviewCards = reviews.map((review) => <ReviewCard key={review.id} review={review} />);
  const reviewEditor = reviewAccountKey === app.ref ? <Column verticalArrangement={{spacedBy:8}}>
    <StarRow selected={reviewStars} enabled={!reviewBusy} onPick={setReviewStars} />
    <OutlinedTextField value={titleNative} singleLine onValueChange={(value) => titleNative.set(value)}><OutlinedTextField.Label>Title (optional)</OutlinedTextField.Label></OutlinedTextField>
    <OutlinedTextField value={bodyNative} onValueChange={(value) => bodyNative.set(value)}><OutlinedTextField.Label>Your review</OutlinedTextField.Label></OutlinedTextField>
    <Row horizontalArrangement={{spacedBy:8}}><Button enabled={!reviewBusy} onClick={() => void sendReview()}><Text>{reviewBusy ? "Sending…" : "Send"}</Text></Button><Show when={Boolean(myReview)}><Button enabled={!reviewBusy} onClick={() => void removeOwnReview()}><Text>Delete</Text></Button></Show></Row>
  </Column> : <Button enabled={!reviewBusy} onClick={() => void signInForReview()}><Text>{reviewBusy ? "Opening account…" : "Sign in to write a review"}</Text></Button>;
  const [tab, setTab] = useState<Tab>("details");
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const actionLabel = actionButtonLabel(busy, busyLabel, updateAvailable, installed);
  const action = actionHandler(updateAvailable, installed, onInstall, onOpen);
  const actionNeedsRepository = updateAvailable || !installed;
  const repoOptions = app.repoOptions ?? [];
  const selectedRepository = repoOptions.find((option) => option.repoId === app.repo);
  const actionEnabled = !busy && (!actionNeedsRepository || (selectedRepository?.installable ?? true));
  const markdown = app.descriptionMarkdown ?? app.description ?? app.summary;
  const openLink = (event: { url: string }) => {
    try { const url = new URL(event.url); if (url.protocol === "http:" || url.protocol === "https:") void Linking.openURL(url.toString()); }
    catch (error) { console.error("Opening app description link failed", error); }
  };
  return <ScrollView onScroll={(event) => { const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent; if (contentOffset.y+layoutMeasurement.height>=contentSize.height-240) void loadMoreReviews(); }} scrollEventThrottle={400} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, gap: 14 }}>
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}><Column verticalArrangement={{ spacedBy: 14 }}>
    <Button onClick={onBack}><Text>‹  Back</Text></Button>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 18 }}>
      <DetailAppIcon app={app} />
      <Column modifiers={[weight(1)]} verticalArrangement={{ spacedBy: 4 }}>
        <Text style={{ typography: "headlineMedium" }}>{app.name}</Text>
        <Text style={{ typography: "bodyMedium" }}>{app.summary}</Text>
        <Text style={{ typography: "bodySmall" }}>{app.developer}</Text>
        <Text style={{ typography: "labelSmall" }}>{app.sourceLabel ?? app.source}</Text>
      </Column>
    </Row>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 10 }}>
      <Button enabled={actionEnabled} onClick={action}><Text>{actionLabel}</Text></Button>
      <RemoveButton installed={installed} busy={busy} onRemove={onRemove} />
      <RepositoryMenu options={repoOptions} selectedRepository={selectedRepository} expanded={sourceMenuOpen} setExpanded={setSourceMenuOpen} onChoose={onChooseRepository} />
    </Row>
    {selectedRepositoryNote(selectedRepository?.note)}
    {progressPanel(progress, percent, busy, canCancel, onCancel)}
    <Show when={Boolean(error)}><Text style={{ typography: "bodyMedium" }} color="#b3261e">{error}</Text></Show>
    <RatingStars app={app} installed={installed} onRate={onRate} />
    <Column verticalArrangement={{spacedBy:8}}>
      <Text style={{typography:"titleLarge"}}>Write a review</Text>
      {reviewEditor}
      <ErrorNote message={reviewError} />
      <Text style={{typography:"titleLarge"}}>Reviews</Text>
      <Show when={reviews.length === 0 && !reviewError}><Text>No reviews yet</Text></Show>
      {reviewCards}
      <Show when={hasMoreReviews}><Button onClick={() => void loadMoreReviews()}><Text>Load more</Text></Button></Show>
    </Column>
    <ScreenshotStrip app={app} />
    <Row horizontalArrangement={{ spacedBy: 8 }}>
      <Button onClick={() => setTab("details")}><Text>Details</Text></Button>
      <Button onClick={() => setTab("permissions")}><Text>Permissions</Text></Button>
    </Row>
    {tabHeader(tab, app)}
    </Column></Host>
    {tabDetails(tab, markdown, colors, openLink)}
    {tabFacts(tab, app)}
  </ScrollView>;
}
