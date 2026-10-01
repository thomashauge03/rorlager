import { useVideoConfig } from "remotion";

/**
 * Samme scener brukes i liggende film, 4:5 til feeden og 9:16 til Reels.
 * Scenene spør hvilket format de står i og legger seg etter det.
 */
export type Format = "liggende" | "feed" | "staaende";

export const useFormat = () => {
  const { width, height } = useVideoConfig();
  const forhold = width / height;
  const type: Format = forhold > 1.2 ? "liggende" : forhold > 0.7 ? "feed" : "staaende";
  return { type, width, height, liggende: type === "liggende" };
};
