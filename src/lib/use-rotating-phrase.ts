import { useEffect, useMemo, useState } from "react";

type UseRotatingPhraseOptions = {
  intervalMs?: number;
};

export const useRotatingPhrase = (
  phrases: string[],
  active: boolean,
  options: UseRotatingPhraseOptions = {}
) => {
  const { intervalMs = 14000 } = options;
  const cleanPhrases = useMemo(
    () => phrases.filter((phrase) => phrase.trim().length > 0),
    [phrases]
  );
  const defaultPhrase = cleanPhrases[0] ?? "";
  const [phrase, setPhrase] = useState(defaultPhrase);

  useEffect(() => {
    if (!active || cleanPhrases.length === 0) return;

    const pickNext = () => {
      setPhrase((prev) => {
        if (cleanPhrases.length === 1) return cleanPhrases[0];
        let next = prev;
        for (let attempt = 0; attempt < 6 && next === prev; attempt += 1) {
          next = cleanPhrases[Math.floor(Math.random() * cleanPhrases.length)];
        }
        return next;
      });
    };

    const initialTimer = setTimeout(pickNext, 0);
    const timer = setInterval(pickNext, intervalMs);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [active, cleanPhrases, intervalMs]);

  return active ? phrase : defaultPhrase;
};
