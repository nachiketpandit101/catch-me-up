export type CatalogBook = {
  number: number;
  title: string;
};

export type CatalogSeries = {
  id: string;
  title: string;
  author: string;
  tagline: string;
  books: CatalogBook[];
  /** Spine / shelf accent */
  accent: string;
  keywords: string[];
};

/** Public catalog for the library UI. Expand as new series are ingested. */
export const SERIES_CATALOG: CatalogSeries[] = [
  {
    id: "red-rising",
    title: "Red Rising",
    author: "Pierce Brown",
    tagline: "A Red rises among Golds on a terraformed Mars.",
    accent: "#9b2c1f",
    keywords: [
      "red rising",
      "pierce brown",
      "darrow",
      "mars",
      "scifi",
      "science fiction",
      "gold",
      "helldiver",
      "morning star",
      "iron gold",
      "dark age",
      "light bringer",
      "lysander",
      "mustang",
    ],
    books: [
      { number: 1, title: "Red Rising" },
      { number: 2, title: "Golden Son" },
      { number: 3, title: "Morning Star" },
      { number: 4, title: "Iron Gold" },
      { number: 5, title: "Dark Age" },
      { number: 6, title: "Light Bringer" },
    ],
  },
];

export function getSeriesById(id: string): CatalogSeries | undefined {
  return SERIES_CATALOG.find((series) => series.id === id);
}

export function searchSeries(query: string): CatalogSeries[] {
  const q = query.trim().toLowerCase();
  if (!q) return SERIES_CATALOG;

  return SERIES_CATALOG.filter((series) => {
    const haystack = [
      series.title,
      series.author,
      series.tagline,
      ...series.keywords,
      ...series.books.map((b) => b.title),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
