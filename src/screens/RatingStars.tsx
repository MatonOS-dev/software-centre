import { useEffect, useState } from "react";
import { Button, Column, Host, Row, Text } from "@expo/ui/jetpack-compose";
import { weight } from "@expo/ui/jetpack-compose/modifiers";
import { MatonOS } from "../../modules/matonos-software/src/MatonOS";
import type { StoreApp } from "../sources/Source";
import { appRatingKey } from "../sources/ratings";
import { MaterialSymbol } from "../components/MaterialSymbol";
import { beginRating, failRating, finishRating, initialRatingState, shownRating, type RatingState } from "./ratingState";

function ratingKey(app: StoreApp): string {
  return `user-rating:${encodeURIComponent(appRatingKey(app))}`;
}

function validRating(value: string | null): number | null {
  if (!value) return null;
  const stars = Number(value);
  return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
}

function RatingButtons({ state, enabled, onRate }: { state: RatingState; enabled: boolean; onRate: (stars: number) => void }) {
  const selected = shownRating(state);
  const buttons = [1, 2, 3, 4, 5].map((stars) => <Button key={stars} enabled={enabled && state.pending === null} onClick={() => onRate(stars)}>
    <MaterialSymbol name={stars <= selected ? "star" : "star_outline"} size={28} description={`${stars} stars`} />
  </Button>);
  return <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 2 }}>{buttons}</Row>;
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

  return <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
    <Column verticalArrangement={{ spacedBy: 2 }}>
      <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }}>
        <Text style={{ typography: "titleMedium" }} modifiers={[weight(1)]}>Rate this app</Text>
        <RatingButtons state={state} enabled={installed} onRate={(stars) => void submit(stars)} />
        {state.pending !== null ? <Text style={{ typography: "bodySmall" }}>Saving…</Text> : null}
        {state.error ? <Text style={{ typography: "bodySmall" }} color="#b3261e">{state.error}</Text> : null}
      </Row>
    </Column>
  </Host>;
}
