import { ImageResponse } from "next/og";
export const alt = "Saobraćajni Duel — razumi pravilo, poveži znanje";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 80,
        background: "#183e34",
        color: "#f8f8f1",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, color: "#d3f16b" }}>
        SAOBRAĆAJNI DUEL · SRBIJA · B KATEGORIJA
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 82, fontWeight: 700 }}>
        <span>Razumi pravilo.</span>
        <span>Poveži znanje.</span>
      </div>
      <div style={{ display: "flex", fontSize: 28 }}>Učenje · Vežbanje · Prijateljski dueli</div>
    </div>,
    size,
  );
}
