"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = exports.PlayerSchema = exports.SegmentSchema = exports.NodeSchema = exports.Vector2Schema = void 0;
const schema_1 = require("@colyseus/schema");
class Vector2Schema extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.x = 0;
        this.y = 0;
    }
}
exports.Vector2Schema = Vector2Schema;
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Vector2Schema.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Vector2Schema.prototype, "y", void 0);
class NodeSchema extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.gridI = 0;
        this.gridJ = 0;
        this.pos = new Vector2Schema();
        this.owner = "";
        this.capturedThisRound = false;
        this.isBase = false;
    }
}
exports.NodeSchema = NodeSchema;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], NodeSchema.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], NodeSchema.prototype, "gridI", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], NodeSchema.prototype, "gridJ", void 0);
__decorate([
    (0, schema_1.type)(Vector2Schema),
    __metadata("design:type", Vector2Schema)
], NodeSchema.prototype, "pos", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], NodeSchema.prototype, "owner", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], NodeSchema.prototype, "capturedThisRound", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], NodeSchema.prototype, "isBase", void 0);
class SegmentSchema extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.p1 = new Vector2Schema();
        this.p2 = new Vector2Schema();
        this.owner = "";
        this.active = true;
        this.createdAtRound = 0;
    }
}
exports.SegmentSchema = SegmentSchema;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], SegmentSchema.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)(Vector2Schema),
    __metadata("design:type", Vector2Schema)
], SegmentSchema.prototype, "p1", void 0);
__decorate([
    (0, schema_1.type)(Vector2Schema),
    __metadata("design:type", Vector2Schema)
], SegmentSchema.prototype, "p2", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], SegmentSchema.prototype, "owner", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], SegmentSchema.prototype, "active", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], SegmentSchema.prototype, "createdAtRound", void 0);
class PlayerSchema extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.uid = "";
        this.startPos = new Vector2Schema();
        this.currentPos = new Vector2Schema();
        this.waypoints = new schema_1.ArraySchema();
        this.ready = false;
        this.connected = true;
    }
}
exports.PlayerSchema = PlayerSchema;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], PlayerSchema.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], PlayerSchema.prototype, "uid", void 0);
__decorate([
    (0, schema_1.type)(Vector2Schema),
    __metadata("design:type", Vector2Schema)
], PlayerSchema.prototype, "startPos", void 0);
__decorate([
    (0, schema_1.type)(Vector2Schema),
    __metadata("design:type", Vector2Schema)
], PlayerSchema.prototype, "currentPos", void 0);
__decorate([
    (0, schema_1.type)([Vector2Schema]),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "waypoints", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], PlayerSchema.prototype, "ready", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], PlayerSchema.prototype, "connected", void 0);
class GameState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.phase = "WAITING"; // WAITING, SETTING_PATH, MOVING
        this.timer = 30;
        this.round = 1;
        this.hostSessionId = "";
        this.players = new schema_1.MapSchema();
        this.nodes = new schema_1.MapSchema();
        this.segments = new schema_1.ArraySchema();
    }
}
exports.GameState = GameState;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], GameState.prototype, "phase", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], GameState.prototype, "timer", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], GameState.prototype, "round", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], GameState.prototype, "hostSessionId", void 0);
__decorate([
    (0, schema_1.type)({ map: PlayerSchema }),
    __metadata("design:type", Object)
], GameState.prototype, "players", void 0);
__decorate([
    (0, schema_1.type)({ map: NodeSchema }),
    __metadata("design:type", Object)
], GameState.prototype, "nodes", void 0);
__decorate([
    (0, schema_1.type)([SegmentSchema]),
    __metadata("design:type", Object)
], GameState.prototype, "segments", void 0);
