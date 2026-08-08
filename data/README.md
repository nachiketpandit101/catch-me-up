# Local book sources

Place series markdown files under this folder. Full book text is **gitignored** and must not be committed.

## Expected layout (Red Rising MVP)

```
data/
  manifest.json          # committed — paths and metadata only
  red-rising/
    red-rising-book1.md  # local only
    golden-son-book2.md  # local only
```

Update `manifest.json` when adding books, then run `npm run ingest`.
