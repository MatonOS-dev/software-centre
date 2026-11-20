export type ReviewDraft = { stars:number; title:string; body:string };

export function canSubmitReview(draft:ReviewDraft):boolean {
  return Number.isInteger(draft.stars) && draft.stars >= 1 && draft.stars <= 5 &&
    draft.title.length <= 80 && draft.body.length <= 2000 &&
    Boolean(draft.title.trim() || draft.body.trim());
}

export function reviewErrorMessage(code:string | undefined, fallback:string):string {
  return code === "text_rejected" ? "Your review contains language that isn't allowed" : fallback;
}
