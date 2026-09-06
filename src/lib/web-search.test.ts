import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SERIES_CATALOG } from "./catalog";
import {
  allowedBookTitles,
  buildWebSearchQuery,
  containsLaterBookTitle,
  laterBookTitles,
} from "./web-search";

const series = SERIES_CATALOG[0];

describe("laterBookTitles", () => {
  it("returns titles past the reader's progress", () => {
    assert.deepEqual(laterBookTitles(series, 2), [
      "Morning Star",
      "Iron Gold",
      "Dark Age",
      "Light Bringer",
    ]);
    assert.deepEqual(allowedBookTitles(series, 2), ["Red Rising", "Golden Son"]);
  });
});

describe("containsLaterBookTitle", () => {
  it("rejects snippets that name a later book", () => {
    assert.equal(
      containsLaterBookTitle("Spoilers from Morning Star follow", [
        "Morning Star",
      ]),
      true,
    );
    assert.equal(
      containsLaterBookTitle("Darrow mines in Lykos", ["Morning Star"]),
      false,
    );
  });
});

describe("buildWebSearchQuery", () => {
  it("bounds the search to allowed books and names later ones to avoid", () => {
    const query = buildWebSearchQuery("Who is Mustang?", series, 2);
    assert.match(query, /Golden Son/);
    assert.match(query, /Morning Star/);
    assert.match(query, /Who is Mustang\?/);
  });
});
