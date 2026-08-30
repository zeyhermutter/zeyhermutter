import { Link } from "react-router";

export type PropertyMapPoint = {
  id: string;
  propertyNumber: string;
  title: string;
  status: string;
  transactionType: string;
  latitude: number;
  longitude: number;
  addressLabel: string;
};

type Pixel = { x: number; y: number };

const TILE_SIZE = 256;

function clampLatitude(latitude: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function worldPixel(latitude: number, longitude: number, zoom: number): Pixel {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = (clampLatitude(latitude) * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * scale,
  };
}

function chooseZoom(points: PropertyMapPoint[]) {
  if (points.length <= 1) return 14;
  for (let zoom = 15; zoom >= 3; zoom -= 1) {
    const pixels = points.map((point) => worldPixel(point.latitude, point.longitude, zoom));
    const xs = pixels.map((point) => point.x);
    const ys = pixels.map((point) => point.y);
    if (Math.max(...xs) - Math.min(...xs) <= 620 && Math.max(...ys) - Math.min(...ys) <= 240) {
      return zoom;
    }
  }
  return 3;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Entwurf",
    ACQUISITION: "Akquise",
    VALUATION: "Bewertung",
    CONTRACT_PENDING: "Vertrag in Vorbereitung",
    PREPARATION: "Vorbereitung",
    MARKETING: "Vermarktung",
    RESERVED: "Reserviert",
    NOTARY: "Notar",
    SOLD: "Verkauft",
  };
  return labels[status] ?? status;
}

export function PropertyOverviewMap({ points }: { points: PropertyMapPoint[] }) {
  if (points.length === 0) {
    return <p className="empty-state">Noch keine Immobilie mit Koordinaten vorhanden.</p>;
  }

  const zoom = chooseZoom(points);
  const minLat = Math.min(...points.map((point) => point.latitude));
  const maxLat = Math.max(...points.map((point) => point.latitude));
  const minLon = Math.min(...points.map((point) => point.longitude));
  const maxLon = Math.max(...points.map((point) => point.longitude));
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const center = worldPixel(centerLat, centerLon, zoom);
  const centerTileX = Math.floor(center.x / TILE_SIZE);
  const centerTileY = Math.floor(center.y / TILE_SIZE);
  const tileCount = 2 ** zoom;

  const tiles = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const rawX = centerTileX + dx;
      const tileY = centerTileY + dy;
      if (tileY < 0 || tileY >= tileCount) continue;
      const tileX = ((rawX % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${zoom}-${rawX}-${tileY}`,
        src: `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`,
        left: rawX * TILE_SIZE - center.x,
        top: tileY * TILE_SIZE - center.y,
      });
    }
  }

  return (
    <>
      <div className="property-map" aria-label="Karte der Immobilienangebote">
        <div className="property-map-tiles" aria-hidden="true">
          {tiles.map((tile) => (
            <img
              alt=""
              draggable={false}
              key={tile.key}
              loading="lazy"
              src={tile.src}
              style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }}
            />
          ))}
        </div>
        {points.map((point) => {
          const pixel = worldPixel(point.latitude, point.longitude, zoom);
          return (
            <Link
              className={`property-map-marker status-${point.status.toLowerCase().replaceAll("_", "-")}`}
              key={point.id}
              style={{
                left: `calc(50% + ${pixel.x - center.x}px)`,
                top: `calc(50% + ${pixel.y - center.y}px)`,
              }}
              title={`${point.propertyNumber} · ${point.title} · ${point.addressLabel}`}
              to={`/properties/${point.id}`}
            >
              <span>{point.transactionType === "SALE" ? "V" : "M"}</span>
            </Link>
          );
        })}
        <div className="property-map-attribution">
          © <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">OpenStreetMap-Mitwirkende</a>
        </div>
      </div>
      <div className="property-map-list">
        {points.map((point) => (
          <Link className="property-map-list-item" key={point.id} to={`/properties/${point.id}`}>
            <strong>{point.propertyNumber} · {point.title}</strong>
            <small>{point.addressLabel} · {statusLabel(point.status)}</small>
          </Link>
        ))}
      </div>
    </>
  );
}
