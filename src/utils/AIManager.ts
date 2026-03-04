import { type PlayerId, type NodeData, type LineSegment } from '../store/useGameState';

interface Vector2 { x: number, y: number }

export class AIManager {
    private static getUnownedNodes(nodes: Record<string, NodeData>): NodeData[] {
        return Object.values(nodes).filter(n => (!n.owner || n.owner === "") && !n.isBase);
    }

    private static getOpponentNodes(nodes: Record<string, NodeData>, myId: PlayerId): NodeData[] {
        return Object.values(nodes).filter(n => n.owner && n.owner !== "" && n.owner !== myId && !n.isBase);
    }

    private static doLinesIntersect(p1: Vector2, p2: Vector2, p3: Vector2, p4: Vector2): boolean {
        const ccw = (A: Vector2, B: Vector2, C: Vector2) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }

    public static generateWaypoints(
        mode: 'RANDOM' | 'GREEDY' | 'AGGRESSIVE' | 'TRAJECTORY',
        startPos: Vector2,
        nodes: Record<string, NodeData>,
        segments: LineSegment[],
        currentWaypoints: Vector2[],
        playerId: PlayerId
    ): Vector2[] {
        if (mode === 'GREEDY' || mode === 'AGGRESSIVE') {
            return this.generateGreedy(startPos, nodes, playerId);
        } else if (mode === 'TRAJECTORY') {
            return this.generateTrajectory(startPos, nodes, segments, playerId);
        }
        return [];
    }

    // MODE B: Greedy Heuristic
    private static generateGreedy(startPos: Vector2, nodes: Record<string, NodeData>, playerId: PlayerId): Vector2[] {
        // 매 걸음마다 평가하기 위해 두 풀(중립지, 적군 점령지)을 모두 가져옵니다.
        const unownedNodes = this.getUnownedNodes(nodes);
        const opponentNodes = this.getOpponentNodes(nodes, playerId);

        const waypoints: Vector2[] = [];
        let current = startPos;

        const ownedCount = Object.values(nodes).filter(n => n.owner === playerId).length;
        const count = 9 + Math.floor(ownedCount / 5) * 3;

        // 목표 1: 중립지가 이 거리보다 멀면 강탈 시도 (AGGRESSIVE의 25보다 넓은 35로 설정)
        const STEAL_THRESHOLD = 35;

        for (let i = 0; i < count; i++) {
            let bestUnownedIdx = -1;
            let minUnownedDist = Infinity;

            for (let j = 0; j < unownedNodes.length; j++) {
                const d = Math.hypot(unownedNodes[j].pos.x - current.x, unownedNodes[j].pos.y - current.y);
                if (d < minUnownedDist) {
                    minUnownedDist = d;
                    bestUnownedIdx = j;
                }
            }

            if (minUnownedDist > STEAL_THRESHOLD || unownedNodes.length === 0) {
                let bestOppIdx = -1;
                let minOppDist = Infinity;

                for (let j = 0; j < opponentNodes.length; j++) {
                    const d = Math.hypot(opponentNodes[j].pos.x - current.x, opponentNodes[j].pos.y - current.y);
                    if (d < minOppDist) {
                        minOppDist = d;
                        bestOppIdx = j;
                    }
                }

                if (bestOppIdx !== -1) {
                    const bestNode = opponentNodes.splice(bestOppIdx, 1)[0];
                    waypoints.push(bestNode.pos);
                    current = bestNode.pos;
                    continue;
                }
            }

            if (bestUnownedIdx !== -1) {
                const bestNode = unownedNodes.splice(bestUnownedIdx, 1)[0];
                waypoints.push(bestNode.pos);
                current = bestNode.pos;
            } else {
                break;
            }
        }
        return waypoints;
    }

    // MODE D: Trajectory (Reactive Snake Routing with Segment Avoidance/Preference)
    private static generateTrajectory(
        startPos: Vector2,
        nodes: Record<string, NodeData>,
        segments: LineSegment[],
        playerId: PlayerId
    ): Vector2[] {
        const unownedNodes = this.getUnownedNodes(nodes);
        const opponentNodes = this.getOpponentNodes(nodes, playerId);

        const p2OwnedCount = Object.values(nodes).filter(n => n.owner === playerId).length;
        const depth = 9 + Math.floor(p2OwnedCount / 5) * 3;
        const maxWaypoints = Math.min(depth, 18);

        const waypoints: Vector2[] = [];
        let currentPos = startPos;
        const STEAL_THRESHOLD = 35;

        for (let i = 0; i < maxWaypoints; i++) {
            let bestUnownedIdx = -1;
            let minUnownedScore = Infinity;
            let bestUnownedDist = Infinity;

            for (let j = 0; j < unownedNodes.length; j++) {
                const node = unownedNodes[j];
                const d = Math.hypot(node.pos.x - currentPos.x, node.pos.y - currentPos.y);
                let score = d;

                segments.forEach(seg => {
                    if (!seg.active) return;
                    if (this.doLinesIntersect(currentPos, node.pos, seg.p1, seg.p2)) {
                        if (seg.owner === playerId) score -= 15;
                        else score += 30;
                    }
                });

                if (score < minUnownedScore) {
                    minUnownedScore = score;
                    bestUnownedIdx = j;
                    bestUnownedDist = d;
                }
            }

            if (bestUnownedDist > STEAL_THRESHOLD || unownedNodes.length === 0) {
                let bestOppIdx = -1;
                let minOppScore = Infinity;

                for (let j = 0; j < opponentNodes.length; j++) {
                    const node = opponentNodes[j];
                    const d = Math.hypot(node.pos.x - currentPos.x, node.pos.y - currentPos.y);
                    let score = d;

                    segments.forEach(seg => {
                        if (!seg.active) return;
                        if (this.doLinesIntersect(currentPos, node.pos, seg.p1, seg.p2)) {
                            if (seg.owner === playerId) score -= 15;
                            else score += 30;
                        }
                    });

                    if (score < minOppScore) {
                        minOppScore = score;
                        bestOppIdx = j;
                    }
                }

                if (bestOppIdx !== -1) {
                    const bestNode = opponentNodes.splice(bestOppIdx, 1)[0];
                    waypoints.push(bestNode.pos);
                    currentPos = bestNode.pos;
                    continue;
                }
            }

            if (bestUnownedIdx !== -1) {
                const bestNode = unownedNodes.splice(bestUnownedIdx, 1)[0];
                waypoints.push(bestNode.pos);
                currentPos = bestNode.pos;
            } else {
                break;
            }
        }

        return waypoints;
    }
}
