export interface NovelSummary {
  id: string;
  title: string;
  author: string;
  caption: string;
  tags: string[];
  publishedAt: string;
  bookmarks: number | null;
  views: number | null;
  textLength: number | null;
  series: { id: string; title: string; order: number } | null;
}

export interface NovelContent {
  id: string;
  title: string;
  author: string;
  paragraphs: string[];
}
