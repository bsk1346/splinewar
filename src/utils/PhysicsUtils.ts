import type { Vector2 } from './MathUtils';

export class PhysicsUtils {
    /**
     * 투영 벡터를 이용한 점과 선분 사이의 최단 거리 연산
     * 선분 바깥쪽(t < 0 또는 t > 1)에 대해서는 양 끝점과의 거리를 반환
     */
    public static getDistancePointToSegment(p: Vector2, v: Vector2, w: Vector2): number {
        const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);

        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));

        const projX = v.x + t * (w.x - v.x);
        const projY = v.y + t * (w.y - v.y);

        return Math.hypot(p.x - projX, p.y - projY);
    }

    // 플레이어(Circle)와 선분(Buff/Debuff) 충돌 여부
    public static isCircleCollidingWithLine(
        center: Vector2,
        radius: number,
        lineStart: Vector2,
        lineEnd: Vector2
    ): boolean {
        return this.getDistancePointToSegment(center, lineStart, lineEnd) <= radius;
    }
}
