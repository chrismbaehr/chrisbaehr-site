export const countMismatches = (guide: string, candidate: string): number => {
  const a = guide.toUpperCase().replace(/[^ACGT]/g, "");
  const b = candidate.toUpperCase().replace(/[^ACGT]/g, "");
  const sharedLength = Math.min(a.length, b.length);
  let mismatches = Math.abs(a.length - b.length);

  for (let i = 0; i < sharedLength; i += 1) {
    if (a[i] !== b[i]) {
      mismatches += 1;
    }
  }

  return mismatches;
};

export const hasValidPam = (pam: string): boolean => {
  const normalized = pam.toUpperCase();
  return /^[ACGT]GG$/.test(normalized);
};

export const classifyCut = (
  guide: string,
  candidate: string,
  pam: string,
): "correct" | "near" | "noPam" | "wrong" => {
  if (!hasValidPam(pam)) {
    return "noPam";
  }

  const mismatches = countMismatches(guide, candidate);
  if (mismatches === 0) {
    return "correct";
  }

  if (mismatches <= 2) {
    return "near";
  }

  return "wrong";
};
