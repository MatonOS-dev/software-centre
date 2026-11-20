import assert from "node:assert/strict";
import { canSubmitReview, reviewErrorMessage } from "../src/screens/reviewFormState.ts";

assert.equal(canSubmitReview({stars:5,title:"Nice",body:"Works well"}), true);
assert.equal(canSubmitReview({stars:0,title:"Nice",body:"Works well"}), false);
assert.equal(canSubmitReview({stars:4,title:" ",body:"\n"}), false);
assert.equal(canSubmitReview({stars:4,title:"x".repeat(81),body:"review"}), false);
assert.equal(canSubmitReview({stars:4,title:"title",body:"x".repeat(2001)}), false);
assert.equal(reviewErrorMessage("text_rejected", "other"), "Your review contains language that isn't allowed");
assert.equal(reviewErrorMessage(undefined, "other"), "other");
console.log("review form state tests passed");
