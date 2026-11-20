import { useEffect, useState } from "react";
import { Column, IconButton, Row, Text, useMaterialColors } from "@expo/ui/jetpack-compose";
import { weight } from "@expo/ui/jetpack-compose/modifiers";
import { MatonOS } from "../../modules/matonos-software/src/MatonOS";
import type { StoreApp } from "../sources/Source";
import { appRatingKey } from "../sources/ratings";
import { beginRating, failRating, finishRating, initialRatingState, shownRating, type RatingState } from "./ratingState";

function ratingKey(app: StoreApp): string {
  return `user-rating:${encodeURIComponent(appRatingKey(app))}`;
}

function validRating(value: string | null): number | null {
  if (!value) return null;
  const stars = Number(value);
  return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
}

export function StarButton({ stars, filled, enabled, onClick }: { stars: number; filled: boolean; enabled: boolean; onClick: (stars: number) => void }) {
  const colors = useMaterialColors();
  return <IconButton enabled={enabled} onClick={() => onClick(stars)} colors={{ containerColor: "transparent", disabledContainerColor: "transparent", contentColor: colors.onSurfaceVariant, disabledContentColor: colors.onSurfaceVariant }}>
    <Text style={{ typography: "headlineSmall" }} color={filled ? colors.primary : colors.onSurfaceVariant}>{filled ? "★" : "☆"}</Text>
  </IconButton>;
}

export function StarRow({ selected, enabled, onPick }: { selected: number; enabled: boolean; onPick: (stars: number) => void }) {
  const buttons = [1, 2, 3, 4, 5].map((stars) => <StarButton key={stars} stars={stars} filled={stars <= selected} enabled={enabled} onClick={onPick} />);
  return <Row verticalAlignment="center">{buttons}</Row>;
}

function RatingNote({ state }: { state: RatingState }) {
  if (state.pending !== null) return <Text style={{ typography: "bodySmall" }}>Saving…</Text>;
  if (state.error) return <Text style={{ typography: "bodySmall" }} color="#b3261e">{state.error}</Text>;
  return null;
}

export function RatingStars({ app, installed, onRate }: { app: StoreApp; installed: boolean; onRate: (stars: number) => Promise<void> }) {
  const [saved, setSaved] = useState<{ key: string; state: RatingState }>({ key: "", state: initialRatingState() });
  const key = ratingKey(app);
  const state = saved.key === key ? saved.state : initialRatingState();
  const setState = (update: (current: RatingState) => RatingState) => setSaved((current) => ({ key, state: update(current.key === key ? current.state : initialRatingState()) }));

  useEffect(() => {
    let active = true;
    void MatonOS.getBrowseCache(key).then((value) => {
      if (active) setSaved({ key, state: initialRatingState(validRating(value)) });
    }).catch((error) => console.warn("Reading saved app rating failed", error));
    return () => { active = false; };
  }, [key]);

  async function submit(stars: number) {
    setState((current) => beginRating(current, stars));
    try {
      await onRate(stars);
      setState((current) => finishRating(current, stars));
      await MatonOS.setBrowseCache(key, String(stars));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rating could not be submitted.";
      setState((current) => failRating(current, message));
    }
  }

  // Rendered inside the detail page's Compose tree: no Host of its own.
  return <Column verticalArrangement={{ spacedBy: 2 }}>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }}>
      <Text style={{ typography: "titleMedium" }} modifiers={[weight(1)]}>Rate this app</Text>
      <StarRow selected={shownRating(state)} enabled={installed && state.pending === null} onPick={(stars) => void submit(stars)} />
    </Row>
    <RatingNote state={state} />
  </Column>;
}
