import type { NovelContent } from "../domain/novel";
import type { RemoteQuery, SearchPage } from "../features/search/types";

// Production implementation will invoke Rust; authentication never belongs in the UI.
export interface NovelProvider {
  search(
    query: RemoteQuery,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<SearchPage>;
  read(id: string, signal: AbortSignal): Promise<NovelContent>;
}
