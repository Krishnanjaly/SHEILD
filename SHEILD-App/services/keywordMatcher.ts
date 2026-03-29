const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const normalizeSpeechText = (value: string) =>
  normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
  );

const editDistance = (left: string, right: string) => {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
};

const similarityScore = (left: string, right: string) => {
  if (!left && !right) return 1;
  const maxLength = Math.max(left.length, right.length) || 1;
  return 1 - editDistance(left, right) / maxLength;
};

const fuzzyPhraseMatch = (transcript: string, keyword: string) => {
  const transcriptWords = transcript.split(" ").filter(Boolean);
  const keywordWords = keyword.split(" ").filter(Boolean);

  if (keywordWords.length === 0 || transcriptWords.length < keywordWords.length) {
    return false;
  }

  for (let start = 0; start <= transcriptWords.length - keywordWords.length; start += 1) {
    const windowWords = transcriptWords.slice(start, start + keywordWords.length);
    const averageScore =
      windowWords.reduce((sum, word, index) => {
        return sum + similarityScore(word, keywordWords[index]);
      }, 0) / keywordWords.length;

    if (averageScore >= 0.72) {
      return true;
    }
  }

  return false;
};

export const findMatchedKeyword = (
  candidates: string[],
  keywords: string[]
): string | null => {
  const normalizedCandidates = candidates
    .map(normalizeSpeechText)
    .filter(Boolean);
  const normalizedKeywords = keywords
    .map(normalizeSpeechText)
    .filter(Boolean);

  for (const keyword of normalizedKeywords) {
    const compactKeyword = keyword.replace(/\s+/g, "");

    for (const candidate of normalizedCandidates) {
      if (candidate.includes(keyword)) {
        return keyword;
      }

      const compactCandidate = candidate.replace(/\s+/g, "");
      if (compactCandidate.includes(compactKeyword)) {
        return keyword;
      }

      if (fuzzyPhraseMatch(candidate, keyword)) {
        return keyword;
      }
    }
  }

  return null;
};
