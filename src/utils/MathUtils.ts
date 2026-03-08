export interface Vector2 {
  x: number;
  y: number;
}

export class SplineTrajectory {
  private points: Vector2[];
  private lut: { t: number; distance: number }[] = [];
  public totalLength: number = 0;

  constructor(waypoints: Vector2[]) {
    // Duplicate start and end points for Catmull-Rom constraints
    if (waypoints.length < 2) {
      this.points = waypoints.map(p => ({ ...p }));
      return;
    }
    this.points = [
      waypoints[0],
      ...waypoints,
      waypoints[waypoints.length - 1]
    ];
    this.buildLUT();
  }

  private getRawSplinePoint(tTotal: number): Vector2 {
    if (this.points.length < 4) {
      if (this.points.length > 0) return this.points[1] || this.points[0];
      return { x: 0, y: 0 };
    }

    const maxSegments = this.points.length - 3; 
    let segment = Math.floor(tTotal);
    let t = tTotal - segment;

    if (segment >= maxSegments) {
      segment = maxSegments - 1;
      t = 1; // Cap exactly at end of last segment
    }
    if (segment < 0) {
      segment = 0;
      t = 0;
    }

    const p0 = this.points[segment];
    const p1 = this.points[segment + 1];
    const p2 = this.points[segment + 2];
    const p3 = this.points[segment + 3];

    const t2 = t * t;
    const t3 = t2 * t;

    // Catmull-Rom Spline Formula (uniform)
    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );

    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );

    return { x, y };
  }

  private buildLUT(samplesPerSegment: number = 100) {
    if (this.points.length < 4) return;
    const maxSegments = this.points.length - 3;
    const totalSamples = maxSegments * samplesPerSegment;

    this.lut.push({ t: 0, distance: 0 });
    let accumulatedDistance = 0;
    let prevPoint = this.getRawSplinePoint(0);

    for (let i = 1; i <= totalSamples; i++) {
      const tTotal = (i / totalSamples) * maxSegments;
      const currPoint = this.getRawSplinePoint(tTotal);
      const dist = Math.hypot(currPoint.x - prevPoint.x, currPoint.y - prevPoint.y);
      accumulatedDistance += dist;
      this.lut.push({ t: tTotal, distance: accumulatedDistance });
      prevPoint = currPoint;
    }
    this.totalLength = accumulatedDistance;
  }

  public getPointAtDistance(d: number): Vector2 {
    if (this.points.length < 4) {
      if (this.points.length > 0) return this.points[1] || this.points[0];
      return { x: 0, y: 0 };
    }

    if (d <= 0) return this.getRawSplinePoint(0);
    // return last segment end
    if (d >= this.totalLength) return this.getRawSplinePoint(this.points.length - 3);

    let low = 0, high = this.lut.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.lut[mid].distance < d) low = mid + 1;
      else high = mid - 1;
    }
    
    const idx = Math.max(0, Math.min(high, this.lut.length - 2));
    
    const t0 = this.lut[idx].t;
    const t1 = this.lut[idx + 1].t;
    const d0 = this.lut[idx].distance;
    const d1 = this.lut[idx + 1].distance;

    let interpolatedT = t0;
    if (d1 > d0) {
      interpolatedT = t0 + ((d - d0) / (d1 - d0)) * (t1 - t0);
    }

    return this.getRawSplinePoint(interpolatedT);
  }
}
