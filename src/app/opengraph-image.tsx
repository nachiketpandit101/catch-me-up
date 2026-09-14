import { ImageResponse } from "next/og";

export const alt = "Catch Me Up — spoiler-free catch-ups for book series";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BOOKS = [
  { title: "Red Rising", unlocked: true },
  { title: "Golden Son", unlocked: true },
  { title: "Morning Star", unlocked: false },
  { title: "Iron Gold", unlocked: false },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 72px",
          background: "linear-gradient(135deg, #2a1e15 0%, #16110d 70%)",
          color: "#f3e6d4",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              letterSpacing: 6,
              color: "#c45c26",
            }}
          >
            CATCH ME UP
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 62,
              lineHeight: 1.1,
            }}
          >
            Remind me what happened.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 62,
              lineHeight: 1.1,
              color: "#e08a4e",
            }}
          >
            Nothing after that.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 27,
              color: "#b8a38d",
            }}
          >
            Answers drawn only from the books you&apos;ve finished, cited to the
            chapter.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
            {BOOKS.map((book, index) => (
              <div
                key={book.title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 74,
                  height: index % 2 === 0 ? 150 : 136,
                  borderRadius: 4,
                  borderLeft:
                    !book.unlocked && BOOKS[index - 1]?.unlocked
                      ? "6px solid #c45c26"
                      : "none",
                  background: book.unlocked
                    ? "linear-gradient(160deg, #9b2c1f 0%, #4a150f 100%)"
                    : "linear-gradient(160deg, #2b211a 0%, #1a120d 100%)",
                  fontSize: 22,
                }}
              >
                {book.unlocked ? "" : "🔒"}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 22,
              color: "#b8a38d",
              paddingBottom: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 6,
                height: 30,
                borderRadius: 3,
                background: "#c45c26",
              }}
            />
            your spoiler line
          </div>
        </div>
      </div>
    ),
    size,
  );
}
