import type { StandardData } from "@/lib/store/types";

/** Candidate patterns for Convention ratification (demo). */
export const mockStandard: StandardData = {
  patterns: [
    {
      id: "std-wait-strategy",
      patternKey: "wait-strategy",
      shapeLabel: "Wait / timeout strategy",
      plainSentence:
        "47 tests follow the pattern “Wait / timeout strategy”. Which form should we prefer?",
      occurrenceCount: 47,
      examples: [
        "PDP image gallery loads within budget",
        "payment confirmation webhook acknowledged",
        "search returns products for common query",
      ],
      status: "CANDIDATE",
    },
    {
      id: "std-commerce-journey",
      patternKey: "commerce-journey",
      shapeLabel: "Commerce journey (checkout/cart/promo)",
      plainSentence:
        "28 tests follow the pattern “Commerce journey (checkout/cart/promo)”. Which form should we prefer?",
      occurrenceCount: 28,
      examples: [
        "guest checkout completes with valid card",
        "promo code applies on cart page",
        "express shipping ETA for rural postcodes",
      ],
      status: "CANDIDATE",
    },
    {
      id: "std-contract-api",
      patternKey: "contract-api",
      shapeLabel: "Contract / API assertion",
      plainSentence:
        "19 tests follow the pattern “Contract / API assertion”. Which form should we prefer?",
      occurrenceCount: 19,
      examples: [
        "gift card balance after partial redeem",
        "fulfil inventory updates after purchase",
      ],
      status: "CANDIDATE",
    },
  ],
};
