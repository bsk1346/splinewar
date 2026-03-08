"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerGameLoop = exports.PhysicsUtils = exports.SpeedManager = exports.SplineTrajectory = void 0;
const GameState_1 = require("./schema/GameState");
const ALL_PLAYERS = ['P1', 'P2', 'P3', 'P4'];
class SplineTrajectory {
    constructor(points) {
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
    getPointAtDistance(d) {
        if (d <= 0)
            return Object.assign({}, this.points[0]);
        if (d >= this.totalLength)
            return Object.assign({}, this.points[this.points.length - 1]);
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
        return Object.assign({}, this.points[this.points.length - 1]);
    }
}
exports.SplineTrajectory = SplineTrajectory;
class SpeedManager {
    constructor() {
        this.buffCombo = 0;
        this.stealCombo = 0;
        this.debuffCombo = 0;
        this.buffTimer = 0;
        this.stealTimer = 0;
        this.debuffTimer = 0;
    }
    updateCombos(dt) {
        if (this.buffTimer > 0) {
            this.buffTimer -= dt;
            if (this.buffTimer <= 0) {
                this.buffCombo = 0;
                this.buffTimer = 0;
            }
        }
        if (this.stealTimer > 0) {
            this.stealTimer -= dt;
            if (this.stealTimer <= 0) {
                this.stealCombo = 0;
                this.stealTimer = 0;
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
    triggerBuff() {
        this.buffTimer = 0.8;
        this.buffCombo += 1;
    }
    triggerStealBuff() {
        this.stealTimer = 0.8;
        this.stealCombo += 1;
    }
    triggerDebuff() {
        this.debuffTimer = 0.8;
        this.debuffCombo += 1;
    }
    calculateCurrentSpeed(n, m, hasPenaltyTimeRemaining) {
        let origin = 4;
        if (hasPenaltyTimeRemaining)
            origin *= 0.8;
        const vBase = origin + (n / 5);
        let vCurrent = vBase * Math.pow(1.2, this.buffCombo) * Math.pow(0.7, this.debuffCombo);
        if (m > n) {
            const multiplier = 1.1 * ((100 + (m - n)) / 100);
            vCurrent *= Math.pow(multiplier, this.stealCombo);
        }
        else {
            vCurrent *= Math.pow(1.1, this.stealCombo);
        }
        return vCurrent;
    }
    resetPhase() {
        this.buffCombo = 0;
        this.stealCombo = 0;
        this.debuffCombo = 0;
        this.buffTimer = 0;
        this.stealTimer = 0;
        this.debuffTimer = 0;
    }
}
exports.SpeedManager = SpeedManager;
class PhysicsUtils {
    static getDistancePointToSegment(p, v, w) {
        const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
        if (l2 === 0)
            return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = v.x + t * (w.x - v.x);
        const projY = v.y + t * (w.y - v.y);
        return Math.hypot(p.x - projX, p.y - projY);
    }
    static isCircleCollidingWithLine(center, radius, lineStart, lineEnd) {
        return this.getDistancePointToSegment(center, lineStart, lineEnd) <= radius;
    }
}
exports.PhysicsUtils = PhysicsUtils;
class ServerGameLoop {
    constructor(state, onMovingFinished) {
        this.updateInterval = null;
        this.lastTime = 0;
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
    getActiveIds() {
        const ids = [];
        this.state.players.forEach((p) => {
            if (p.connected)
                ids.push(p.id);
        });
        return ids;
    }
    startMoving() {
        const activeIds = this.getActiveIds();
        // Reset sub-state
        this.nodesArrayThisRound = { P1: [], P2: [], P3: [], P4: [] };
        activeIds.forEach(pid => {
            const playerSchema = this.state.players.get(pid);
            if (!playerSchema)
                return;
            const wps = [{ x: playerSchema.startPos.x, y: playerSchema.startPos.y }];
            playerSchema.waypoints.forEach(wp => wps.push({ x: wp.x, y: wp.y }));
            if (wps.length < 2)
                wps.push(Object.assign({}, wps[0]));
            this.trajRef[pid] = new SplineTrajectory(wps);
            this.posRef[pid] = Object.assign({}, wps[0]);
            this.distRef[pid] = 0;
            playerSchema.currentPos.x = this.posRef[pid].x;
            playerSchema.currentPos.y = this.posRef[pid].y;
            this.spdRef[pid].resetPhase();
        });
        this.state.timer = 0;
        this.lastTime = Date.now();
        if (this.updateInterval)
            clearInterval(this.updateInterval);
        this.updateInterval = setInterval(() => this.tick(), 30); // ~33fps
    }
    handleCollisions(dt) {
        const captureRadius = 0.5;
        const activeIds = this.getActiveIds();
        // Node Capture
        this.state.nodes.forEach((node, nodeId) => {
            if (node.capturedThisRound || node.isBase)
                return;
            const hitters = [];
            activeIds.forEach(p => {
                const pos = this.posRef[p];
                const d = Math.hypot(pos.x - node.pos.x, pos.y - node.pos.y);
                if (d <= captureRadius)
                    hitters.push(p);
            });
            if (hitters.length > 1) {
                // Simultaneous hit -> ignore
            }
            else if (hitters.length === 1) {
                const p = hitters[0];
                const oldOwner = node.owner;
                if (oldOwner === p) {
                    // Own node, just visit
                    this.nodesArrayThisRound[p].push(node);
                }
                else {
                    node.owner = p;
                    node.capturedThisRound = true;
                    this.nodesArrayThisRound[p].push(node);
                    if (oldOwner !== "" && oldOwner !== p) {
                        this.spdRef[p].triggerStealBuff();
                    }
                    else if (oldOwner !== p) {
                        this.spdRef[p].triggerBuff();
                    }
                }
            }
        });
        // Segment Collision
        this.state.segments.forEach(seg => {
            if (!seg.active)
                return;
            const hitters = [];
            activeIds.forEach(p => {
                const pos = this.posRef[p];
                const hit = PhysicsUtils.isCircleCollidingWithLine(pos, captureRadius, { x: seg.p1.x, y: seg.p1.y }, { x: seg.p2.x, y: seg.p2.y });
                if (hit)
                    hitters.push(p);
            });
            if (hitters.length > 1) {
                // Ignore
            }
            else if (hitters.length === 1) {
                const p = hitters[0];
                if (seg.owner === p) {
                    this.spdRef[p].triggerBuff();
                }
                else {
                    this.spdRef[p].triggerDebuff();
                }
                seg.active = false;
            }
        });
    }
    tick() {
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
                    if (n.owner === p)
                        ownedNodes++;
                });
                let maxOpponentNodes = 0;
                activeIds.forEach(opp => {
                    if (opp !== p) {
                        let oppNodes = 0;
                        this.state.nodes.forEach(n => {
                            if (n.owner === opp)
                                oppNodes++;
                        });
                        if (oppNodes > maxOpponentNodes)
                            maxOpponentNodes = oppNodes;
                    }
                });
                // Not syncing `failedLastRound` strictly to schema for now since it mostly affects speed visually
                const speed = this.spdRef[p].calculateCurrentSpeed(ownedNodes, maxOpponentNodes, false);
                this.distRef[p] += speed * dt;
                if (this.trajRef[p]) {
                    this.posRef[p] = this.trajRef[p].getPointAtDistance(this.distRef[p]);
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
    finishMovingPhase() {
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
                const seg = new GameState_1.SegmentSchema();
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
    dispose() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}
exports.ServerGameLoop = ServerGameLoop;
