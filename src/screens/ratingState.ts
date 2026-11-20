export type RatingState = { rating: number | null; pending: number | null; error: string };

export function initialRatingState(rating: number | null = null): RatingState {
  return { rating, pending: null, error: "" };
}

export function beginRating(state: RatingState, stars: number): RatingState {
  return { ...state, pending: stars, error: "" };
}

export function finishRating(_state: RatingState, stars: number): RatingState {
  return { rating: stars, pending: null, error: "" };
}

export function failRating(state: RatingState, error: string): RatingState {
  return { ...state, pending: null, error };
}

export function shownRating(state: RatingState): number {
  return state.pending ?? state.rating ?? 0;
}
