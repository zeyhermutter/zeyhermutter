import { useState } from "react";
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
type PositionedPoint = { point: PropertyMapPoint; x: number; y: number };
type PointCluster = { id: string; points: PositionedPoint[]; x: number; y: number };

const TILE_SIZE = 256;
const CLUSTER_RADIUS_PX = 46;
const DASHBOARD_LAYOUT_CSS = `
.app-content .metric-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.app-content>.metric-grid+.data-card{width:100%;max-width:1320px!important;margin:12px auto 0}
@media(max-width:1180px){.app-content .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.app-content .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.app-content .metric-grid{grid-template-columns:1fr}}
`;

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
    LOST: "Verloren",
    WITHDRAWN: "Zurückgezogen",
    ARCHIVED: "Archiviert",
  };
  return labels[status] ?? status;
}

function clusterPoints(points: PositionedPoint[]): PointCluster[] {
  const working: Array<{ points: PositionedPoint[]; x: number; y: number }> = [];

  for (const item of points) {
    let closest: (typeof working)[number] | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of working) {
      const distance = Math.hypot(item.x - cluster.x, item.y - cluster.y);
      if (distance <= CLUSTER_RADIUS_PX && distance < closestDistance) {
        closest = cluster;
        closestDistance = distance;
      }
    }

    if (!closest) {
      working.push({ points: [item], x: item.x, y: item.y });
      continue;
    }

    closest.points.push(item);
    closest.x = closest.points.reduce((sum, value) => sum + value.x, 0) / closest.points.length;
    closest.y = closest.points.reduce((sum, value) => sum + value.y, 0) / closest.points.length;
  }

  return working.map((cluster) => ({
    ...cluster,
    id: cluster.points.map(({ point }) => point.id).sort().join("-"),
  }));
}

export function PropertyOverviewMap({ points }: { points: PropertyMapPoint[] }) {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const layoutRules = <style>{DASHBOARD_LAYOUT_CSS}</style>;

  if (points.length === 0) {
    return <>{layoutRules}<p className="empty-state">Noch keine Immobilie mit Koordinaten vorhanden.</p></>;
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

  const positionedPoints = points.map((point) => {
    const pixel = worldPixel(point.latitude, point.longitude, zoom);
    return { point, x: pixel.x, y: pixel.y };
  });
  const clusters = clusterPoints(positionedPoints);
  const selectedCluster = clusters.find((cluster) => cluster.id === selectedClusterId && cluster.points.length > 1) ?? null;

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
      {layoutRules}
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

        {clusters.map((cluster) => {
          const left = `calc(50% + ${cluster.x - center.x}px)`;
          const top = `calc(50% + ${cluster.y - center.y}px)`;

          if (cluster.points.length === 1) {
            const point = cluster.points[0].point;
            return (
              <Link
                className={`property-map-marker status-${point.status.toLowerCase().replaceAll("_", "-")}`}
                key={cluster.id}
                style={{ left, top }}
                title={`${point.propertyNumber} · ${point.title} · ${point.addressLabel}`}
                to={`/properties/${point.id}`}
              >
                <span>{point.transactionType === "SALE" ? "V" : "M"}</span>
              </Link>
            );
          }

          const active = selectedCluster?.id === cluster.id;
          return (
            <button
              aria-expanded={active}
              aria-label={`${cluster.points.length} Immobilien in diesem Bereich anzeigen`}
              className={`property-map-cluster${active ? " active" : ""}`}
              key={cluster.id}
              onClick={() => setSelectedClusterId(active ? null : cluster.id)}
              style={{ left, top }}
              type="button"
            >
              {cluster.points.length}
            </button>
          );
        })}

        {selectedCluster ? (
          <div className="property-map-popup" role="dialog" aria-label="Immobilien an diesem Standort">
            <div className="property-map-popup-head">
              <div>
                <strong>{selectedCluster.points.length} Immobilien</strong>
                <small>an diesem Standort bzw. in unmittelbarer Nähe</small>
              </div>
              <button aria-label="Übersicht schließen" onClick={() => setSelectedClusterId(null)} type="button">×</button>
            </div>
            <div className="property-map-popup-list">
              {selectedCluster.points.map(({ point }) => (
                <Link key={point.id} to={`/properties/${point.id}`} className="property-map-popup-item">
                  <span className={`property-map-popup-marker status-${point.status.toLowerCase().replaceAll("_", "-")}`}>
                    {point.transactionType === "SALE" ? "V" : "M"}
                  </span>
                  <span>
                    <strong>{point.propertyNumber} · {point.title}</strong>
                    <small>{statusLabel(point.status)} · {point.addressLabel}</small>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="property-map-attribution">
          © <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">OpenStreetMap-Mitwirkende</a>
        </div>
      </div>
    </>
  );
}
