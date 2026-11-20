import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, ScrollView } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { FlatList, View } from "react-native";
import { Image as ComposeImage, Button, Column, DropdownMenu, DropdownMenuItem, Host, LinearProgressIndicator, OutlinedTextField, Row, SegmentedButton, Spacer, SingleChoiceSegmentedButtonRow, Text, useMaterialColors, useNativeState } from "@expo/ui/jetpack-compose";
import { fillMaxWidth, height, padding, weight, width } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "../sources/Source";
import { PermissionList } from "../components/PermissionList";
import { Show } from "../components/Show";
import { RatingStars, StarRow } from "./RatingStars";
import { appRatingKey, fetchReviews, type OwnedReview } from "../sources/ratings";
import type { Review } from "../sources/Source";
import { canSubmitReview, reviewErrorMessage } from "./reviewFormState";

type Tab = "details" | "permissions" | "reviews";

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
    <DropdownMenu.Trigger><Button onClick={() => setExpanded(true)}><Text>▾</Text></Button></DropdownMenu.Trigger>
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

function TabBar({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "details", label: "Details" }, { id: "permissions", label: "Permissions" }, { id: "reviews", label: "Reviews" },
  ];
  const items = tabs.map((item) => <SegmentedButton key={item.id} selected={tab === item.id} onClick={() => setTab(item.id)}>
    <SegmentedButton.Label>{item.label}</SegmentedButton.Label>
  </SegmentedButton>);
  return <SingleChoiceSegmentedButtonRow>{items}</SingleChoiceSegmentedButtonRow>;
}

function safetySection(app: StoreApp) {
  const safetyItems = app.safety?.items ?? [];
  const antiFeatures = app.antiFeatures ?? [];
  const categories = app.ageRating?.categories ?? [];
  const safetyRows = safetyItems.map((item) => <Column key={item.id} verticalArrangement={{ spacedBy: 2 }} modifiers={[padding(6, 0, 6, 0)]}>
    <Text style={{ typography: "titleSmall" }}>{item.title}</Text><Text style={{ typography: "bodySmall" }}>{item.description}</Text>
  </Column>);
  const antiFeatureRows = antiFeatures.map((item) => <Column key={item.id} verticalArrangement={{ spacedBy: 2 }} modifiers={[padding(6, 0, 6, 0)]}>
    <Text style={{ typography: "titleSmall" }}>{item.title}</Text><Text style={{ typography: "bodySmall" }}>{item.description}</Text>
    <Text style={{ typography: "bodySmall" }}>{item.reason}</Text>
  </Column>);
  const categoryRows = categories.map((item) => <Text key={item.id} style={{ typography: "bodySmall" }}>{`${item.title}: ${item.level}`}</Text>);
  if (!app.safety && antiFeatures.length === 0 && !app.ageRating) return null;
  const level = app.safety?.level.replaceAll("-", " ");
  return <Column verticalArrangement={{ spacedBy: 6 }}>
    <Text style={{ typography: "titleMedium" }}>Safety</Text>
    {level ? <Text style={{ typography: "bodyMedium" }}>{`Safety assessment: ${level}`}</Text> : null}
    {safetyRows}{antiFeatureRows}
    {app.ageRating ? <Text style={{ typography: "bodyMedium" }}>{`Age rating: ${app.ageRating.label || `${app.ageRating.minimumAge}+`} ${app.ageRating.system}`}</Text> : null}
    {categoryRows}
  </Column>;
}

// Rendered after the page Host as React Native siblings: the Markdown view is not a Compose
// node, and a Host must not sit inside another Host's Compose tree.
function tabDetails(app: StoreApp, markdown: string, colors: ReturnType<typeof useMaterialColors>, openLink: (event: { url: string }) => void) {
  return <>
    <EnrichedMarkdownText markdown={markdown} flavor="commonmark" selectable onLinkPress={openLink}
    markdownStyle={{ paragraph: { fontSize: 14, color: colors.onSurface, lineHeight: 21, marginBottom: 12 },
      h1: { color: colors.onSurface }, h2: { color: colors.onSurface }, h3: { color: colors.onSurface },
      list: { color: colors.onSurface, itemSpacing: 5 }, link: { color: colors.primary } }} />
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}><Column verticalArrangement={{ spacedBy: 14 }}>
      <ScreenshotStrip app={app} />
      <DetailFacts app={app} />
      {safetySection(app)}
      <Text style={{ typography: "bodySmall" }}>{`Package name: ${app.packageName}`}</Text>
    </Column></Host>
  </>;
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
  onSignIn, onSubmitReview, onDeleteReview, onBack, onInstall, onRemove, onOpen, onCancel, onChooseRepository, appBar }: {
  app: StoreApp; installed: boolean; updateAvailable: boolean; busy: boolean; busyLabel: string;
  progress: string; percent: number | null; canCancel: boolean; error: string; onRate: (stars: number) => Promise<void>;
  onSignIn: () => Promise<OwnedReview | null>;
  onSubmitReview: (stars:number,title:string,body:string) => Promise<void>; onDeleteReview: () => Promise<void>;
  onBack: () => void; onInstall: () => void; onRemove: () => void; onOpen: () => void; onCancel: () => void; onChooseRepository: (repoId: string) => void;
  appBar: ReactNode;
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
  const reviewsContent = <Column verticalArrangement={{spacedBy:8}}>
    <Text style={{typography:"titleLarge"}}>Write a review</Text>
    {reviewEditor}
    <ErrorNote message={reviewError} />
    <Text style={{typography:"titleLarge"}}>Reviews</Text>
    <Show when={reviews.length === 0 && !reviewError}><Text>No reviews yet</Text></Show>
    {reviewCards}
    <Show when={hasMoreReviews}><Button onClick={() => void loadMoreReviews()}><Text>Load more</Text></Button></Show>
  </Column>;
  const [tab, setTab] = useState<Tab>("details");
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const actionLabel = actionButtonLabel(busy, busyLabel, updateAvailable, installed);
  const action = actionHandler(updateAvailable, installed, onInstall, onOpen);
  const actionNeedsRepository = updateAvailable || !installed;
  const repoOptions = app.repoOptions ?? [];
  const selectedRepository = repoOptions.find((option) => option.repoId === app.repo) ?? repoOptions.find((option) => option.installable);
  const actionEnabled = !busy && (!actionNeedsRepository || (selectedRepository?.installable ?? true));
  const markdown = app.descriptionMarkdown ?? app.description ?? app.summary;
  const openLink = (event: { url: string }) => {
    try { const url = new URL(event.url); if (url.protocol === "http:" || url.protocol === "https:") void Linking.openURL(url.toString()); }
    catch (error) { console.error("Opening app description link failed", error); }
  };
  return <ScrollView onScroll={(event) => { const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent; if (tab === "reviews" && contentOffset.y+layoutMeasurement.height>=contentSize.height-240) void loadMoreReviews(); }} scrollEventThrottle={400} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, gap: 14 }}>
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}><Column verticalArrangement={{ spacedBy: 14 }}>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 10 }} modifiers={[fillMaxWidth()]}>
      <Button onClick={onBack}><Text>‹  Back</Text></Button>
      <Spacer modifiers={[weight(1)]} />
      <Button enabled={actionEnabled} onClick={action}><Text>{actionNeedsRepository ? `Install from ${selectedRepository?.name ?? "repository"}` : actionLabel}</Text></Button>
      <RemoveButton installed={installed} busy={busy} onRemove={onRemove} />
      <RepositoryMenu options={repoOptions} selectedRepository={selectedRepository} expanded={sourceMenuOpen} setExpanded={setSourceMenuOpen} onChoose={onChooseRepository} />
    </Row>
    <View style={{ height: 1, backgroundColor: colors.outlineVariant }} />
    {appBar}
    <View style={{ height: 1, backgroundColor: colors.outlineVariant }} />
    {selectedRepositoryNote(selectedRepository?.note)}
    {progressPanel(progress, percent, busy, canCancel, onCancel)}
    <Show when={Boolean(error)}><Text style={{ typography: "bodyMedium" }} color="#b3261e">{error}</Text></Show>
    <RatingStars app={app} installed={installed} onRate={onRate} />
    <TabBar tab={tab} setTab={setTab} />
    <Show when={tab === "details"}><Text style={{ typography: "titleMedium" }}>About this app</Text></Show>
    <Show when={tab === "permissions"}><PermissionList app={app} /></Show>
    <Show when={tab === "reviews"}>{reviewsContent}</Show>
    </Column></Host>
    {tab === "details" ? tabDetails(app, markdown, colors, openLink) : null}
  </ScrollView>;
}
