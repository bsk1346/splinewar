import { Server, LobbyRoom } from "colyseus";
import { GameState, NodeSchema, SegmentSchema, PlayerSchema } from "./schema/GameState";
import { Vector2Schema } from "./schema/GameState";

type PlayerId = "P1" | "P2" | "P3" | "P4";
const ALL_PLAYERS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];

export interface Vector2 {
    x: number;
    y: number;
}

export class SplineTrajectory {
    points: Vector2[];
    distances: number[];
    totalLength: number;

    constructor(points: Vector2[]) {
        this.points = points;
        this.distances = [0];
        let len = 0;

        for (let i = 1; i < points.length; i++) {
            const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            len += d;
            this.distances.push(len);
        }
        this.totalLength = len;
    }

    getPointAtDistance(d: number): Vector2 {
        if (d <= 0) return { ...this.points[0] };
        if (d >= this.totalLength) return { ...this.points[this.points.length - 1] };

        for (let i = 1; i < this.distances.length; i++) {
            if (d <= this.distances[i]) {
                const segLen = this.distances[i] - this.distances[i - 1];
                const t = segLen === 0 ? 0 : (d - this.distances[i - 1]) / segLen;
                const p1 = this.points[i - 1];
                const p2 = this.points[i];
                return {
                    x: p1.x + (p2.x - p1.x) * t,
                    y: p1.y + (p2.y - p1.y) * t
                };
            }
        }
        return { ...this.points[this.points.length - 1] };
    }
}

export class SpeedManager {
    public buffCombo: number = 0;
    public stealCombo: number = 0;
    public allyLineCombo: number = 0;
    public debuffCombo: number = 0;

    public buffTimer: number = 0;
    public stealTimer: number = 0;
    public allyLineTimer: number = 0;
    public debuffTimer: number = 0;

    public updateCombos(dt: number) {
        if (this.buffTimer > 0) {
            this.buffTimer -= dt;
            this.stealTimer -= dt;
            this.allyLineTimer -= dt;
            if (this.buffTimer <= 0) {
                this.buffCombo = 0;
                this.stealCombo = 0;
                this.allyLineCombo = 0;
                this.buffTimer = 0;
                this.stealTimer = 0;
                this.allyLineTimer = 0;
            }
        }
        if (this.debuffTimer > 0) {
            this.debuffTimer -= dt;
            if (this.debuffTimer <= 0) {
                this.debuffCombo = 0;
                this.debuffTimer = 0;
            }
        }
    }

    private renewPositiveTimers(n: number) {
        const t = 0.8 + (n / 100);
        this.buffTimer = t;
        this.stealTimer = t;
        this.allyLineTimer = t;
    }

    public triggerBuff(n: number) {
        this.buffCombo += 1;
        this.renewPositiveTimers(n);
    }

    public triggerStealBuff(n: number) {
        this.stealCombo += 1;
        this.renewPositiveTimers(n);
    }

    public triggerAllyLineBuff(n: number) {
        this.allyLineCombo += 1;
        this.renewPositiveTimers(n);
    }

    public triggerDebuff(n: number) {
        this.debuffCombo += 1;
        this.debuffTimer = 0.8 + (n / 100);
    }

    public calculateCurrentSpeed(
        n: number,
        m: number,
        r: number,
        hasPenaltyTimeRemaining: boolean
    ): number {
        let origin = 4;
        if (hasPenaltyTimeRemaining) origin *= 0.8;

        const vBase = origin + (n / 10) + (r / 4);

        const buffMultiplier = Math.pow(1.15, this.buffCombo);
        const debuffBase = 0.7 + (n / 200);
        const debuffMultiplier = Math.pow(debuffBase, this.debuffCombo);
        const allyLineMultiplier = Math.pow(1.1, this.allyLineCombo);

        let vCurrent = vBase * buffMultiplier * debuffMultiplier * allyLineMultiplier;

        if (m > n) {
            const stealMultiplier = 1.05 * ((105 + (m - n)) / 100);
            vCurrent *= Math.pow(stealMultiplier, this.stealCombo);
        } else {
            vCurrent *= Math.pow(1.05, this.stealCombo);
        }
        return vCurrent;
    }

    public resetPhase() {
        this.buffCombo = 0;
        this.stealCombo = 0;
        this.allyLineCombo = 0;
        this.debuffCombo = 0;

        this.buffTimer = 0;
        this.stealTimer = 0;
        this.allyLineTimer = 0;
        this.debuffTimer = 0;
    }
}

export class PhysicsUtils {
    public static getDistancePointToSegment(p: Vector2, v: Vector2, w: Vector2): number {
        const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);

        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));

        const projX = v.x + t * (w.x - v.x);
        const projY = v.y + t * (w.y - v.y);

        return Math.hypot(p.x - projX, p.y - projY);
    }

    public static isCircleCollidingWithLine(
        center: Vector2,
        radius: number,
        lineStart: Vector2,
        lineEnd: Vector2
    ): boolean {
        return this.getDistancePointToSegment(center, lineStart, lineEnd) <= radius;
    }
}

export class ServerGameLoop {
    private state: GameState;
    private onMovingFinished: () => void;

    private spdRef: Record<PlayerId, SpeedManager>;
    private trajRef: Record<PlayerId, SplineTrajectory | null>;
    private posRef: Record<PlayerId, Vector2>;
    private distRef: Record<PlayerId, number>;

    // Server nodes array this round for segment generation
    private nodesArrayThisRound: Record<PlayerId, NodeSchema[]>;

    private updateInterval: NodeJS.Timeout | null = null;
    private lastTime: number = 0;

    constructor(state: GameState, onMovingFinished: () => void) {
        this.state = state;
        this.onMovingFinished = onMovingFinished;

        this.spdRef = {
            P1: new SpeedManager(),
            P2: new SpeedManager(),
            P3: new SpeedManager(),
            P4: new SpeedManager()
        };
        this.trajRef = { P1: null, P2: null, P3: null, P4: null };
        this.posRef = {
            P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 },
            P3: { x: 0, y: 0 }, P4: { x: 0, y: 0 }
        };
        this.distRef = { P1: 0, P2: 0, P3: 0, P4: 0 };
        this.nodesArrayThisRound = { P1: [], P2: [], P3: [], P4: [] };
    }

    private getActiveIds(): PlayerId[] {
        const ids: PlayerId[] = [];
        this.state.players.forEach((p) => {
            if (p.connected) ids.push(p.id as PlayerId);
        });
        return ids;
    }

    public startMoving() {
        const activeIds = this.getActiveIds();

        // Reset sub-state
        this.nodesArrayThisRound = { P1: [], P2: [], P3: [], P4: [] };

        activeIds.forEach(pid => {
            const playerSchema = this.state.players.get(pid);
            if (!playerSchema) return;

            const wps: Vector2[] = [{ x: playerSchema.startPos.x, y: playerSchema.startPos.y }];
            playerSchema.waypoints.forEach(wp => wps.push({ x: wp.x, y: wp.y }));

            if (wps.length < 2) wps.push({ ...wps[0] });

            this.trajRef[pid] = new SplineTrajectory(wps);
            this.posRef[pid] = { ...wps[0] };
            this.distRef[pid] = 0;

            playerSchema.currentPos.x = this.posRef[pid].x;
            playerSchema.currentPos.y = this.posRef[pid].y;

            this.spdRef[pid].resetPhase();
        });

        this.state.timer = 0;
        this.lastTime = Date.now();

        if (this.updateInterval) clearInterval(this.updateInterval);
        this.updateInterval = setInterval(() => this.tick(), 30); // ~33fps
    }

    private handleCollisions(dt: number) {
        const captureRadius = 0.5;
        const activeIds = this.getActiveIds();

        const getOwnedNodes = (playerId: PlayerId) => {
            let count = 0;
            this.state.nodes.forEach(n => {
                if (n.owner === playerId) count++;
            });
            return count;
        };

        // Node Capture
        this.state.nodes.forEach((node, nodeId) => {
            if (node.capturedThisRound || node.isBase) return;

            const hitters: PlayerId[] = [];
            activeIds.forEach(p => {
                const pos = this.posRef[p];
                const d = Math.hypot(pos.x - node.pos.x, pos.y - node.pos.y);
                if (d <= captureRadius) hitters.push(p);
            });

            if (hitters.length > 1) {
                // Simultaneous hit -> ignore
            } else if (hitters.length === 1) {
                const p = hitters[0];
                const oldOwner = node.owner;

                if (oldOwner === p) {
                    // Own node, just visit
                    this.nodesArrayThisRound[p].push(node);
                } else {
                    node.owner = p;
                    node.capturedThisRound = true;
                    this.nodesArrayThisRound[p].push(node);

                    const currentNodes = getOwnedNodes(p);
                    if (oldOwner !== "" && oldOwner !== p) {
                        this.spdRef[p].triggerStealBuff(currentNodes);
                    } else if (oldOwner !== p) {
                        this.spdRef[p].triggerBuff(currentNodes);
                    }
                }
            }
        });

        // Segment Collision
        this.state.segments.forEach(seg => {
            if (!seg.active) return;

            const hitters: PlayerId[] = [];
            activeIds.forEach(p => {
                const pos = this.posRef[p];
                const hit = PhysicsUtils.isCircleCollidingWithLine(
                    pos, captureRadius,
                    { x: seg.p1.x, y: seg.p1.y },
                    { x: seg.p2.x, y: seg.p2.y }
                );
                if (hit) hitters.push(p);
            });

            if (hitters.length > 1) {
                // Ignore
            } else if (hitters.length === 1) {
                const p = hitters[0];
                const currentNodes = getOwnedNodes(p);
                if (seg.owner === p) {
                    this.spdRef[p].triggerAllyLineBuff(currentNodes);
                } else {
                    this.spdRef[p].triggerDebuff(currentNodes);
                }
                seg.active = false;
            }
        });
    }

    private tick() {
        const now = Date.now();
        const fullDt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        const maxSubSteppingDt = 0.005;
        const steps = Math.max(1, Math.ceil(fullDt / maxSubSteppingDt));
        const dt = fullDt / steps;

        const activeIds = this.getActiveIds();

        for (let i = 0; i < steps; i++) {
            this.state.timer += dt;

            activeIds.forEach(p => {
                this.spdRef[p].updateCombos(dt);

                let ownedNodes = 0;
                this.state.nodes.forEach(n => {
                    if (n.owner === p) ownedNodes++;
                });

                let totalOpponentNodes = 0;
                activeIds.forEach(opp => {
                    if (opp !== p) {
                        this.state.nodes.forEach(n => {
                            if (n.owner === opp) totalOpponentNodes++;
                        });
                    }
                });

                // Not syncing `failedLastRound` strictly to schema for now since it mostly affects speed visually
                const speed = this.spdRef[p].calculateCurrentSpeed(
                    ownedNodes,
                    totalOpponentNodes,
                    this.state.round,
                    false
                );

                this.distRef[p] += speed * dt;

                if (this.trajRef[p]) {
                    this.posRef[p] = this.trajRef[p]!.getPointAtDistance(this.distRef[p]);
                }
            });

            // Sub-stepped collisions to prevent tunneling
            this.handleCollisions(dt);
        }

        // Sync schema pos for network interpolation
        activeIds.forEach(p => {
            const playerSchema = this.state.players.get(p);
            if (playerSchema) {
                playerSchema.currentPos.x = this.posRef[p].x;
                playerSchema.currentPos.y = this.posRef[p].y;
            }
        });

        if (this.state.timer >= 5.0) {
            this.finishMovingPhase();
        }
    }

    private finishMovingPhase() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        const activeIds = this.getActiveIds();

        // Expire segments
        const keptSegments = Array.from(this.state.segments).filter(seg => this.state.round - seg.createdAtRound < 2);
        this.state.segments.clear();
        keptSegments.forEach(seg => this.state.segments.push(seg));

        // Generate new segments
        activeIds.forEach(p => {
            const nodes = this.nodesArrayThisRound[p];
            for (let k = 0; k < nodes.length - 1; k++) {
                const seg = new SegmentSchema();
                seg.id = `${p}_seg_${this.state.round}_${k}`;
                seg.p1.x = nodes[k].pos.x;
                seg.p1.y = nodes[k].pos.y;
                seg.p2.x = nodes[k + 1].pos.x;
                seg.p2.y = nodes[k + 1].pos.y;
                seg.owner = p;
                seg.active = true;
                seg.createdAtRound = this.state.round;
                this.state.segments.push(seg);
            }
        });

        // Reset capture flag
        this.state.nodes.forEach(n => {
            n.capturedThisRound = false;
        });

        // Reset players startPos
        activeIds.forEach(p => {
            const playerSchema = this.state.players.get(p);
            if (playerSchema) {
                playerSchema.startPos.x = this.posRef[p].x;
                playerSchema.startPos.y = this.posRef[p].y;
                playerSchema.waypoints.clear();
                playerSchema.ready = false;
            }
        });

        this.onMovingFinished();
    }

    public dispose() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}
