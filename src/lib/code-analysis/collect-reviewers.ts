export type ReviewInput = {
  state: string;
  user: { login: string } | null;
};

/** Unique logins with APPROVED state; later approvals win over earlier dismissals per login. */
export function collectReviewers(reviews: ReviewInput[]): string[] {
  const approved = new Map<string, number>();

  reviews.forEach((review, index) => {
    const login = review.user?.login;
    if (!login) return;
    if (review.state === "APPROVED") {
      approved.set(login, index);
    } else if (review.state === "DISMISSED" || review.state === "CHANGES_REQUESTED") {
      approved.delete(login);
    }
  });

  return [...approved.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([login]) => login);
}

export function countApprovals(reviews: { state: string }[]): number {
  return reviews.filter((r) => r.state === "APPROVED").length;
}
