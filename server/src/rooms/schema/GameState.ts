import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class Vector2Schema extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
}

export class NodeSchema extends Schema {
    @type("string") id: string = "";
    @type("number") gridI: number = 0;
    @type("number") gridJ: number = 0;
    @type(Vector2Schema) pos: Vector2Schema = new Vector2Schema();
    @type("string") owner: string = "";
    @type("boolean") capturedThisRound: boolean = false;
    @type("boolean") isBase: boolean = false;
}

export class SegmentSchema extends Schema {
    @type("string") id: string = "";
    @type(Vector2Schema) p1: Vector2Schema = new Vector2Schema();
    @type(Vector2Schema) p2: Vector2Schema = new Vector2Schema();
    @type("string") owner: string = "";
    @type("boolean") active: boolean = true;
    @type("number") createdAtRound: number = 0;
}

export class PlayerSchema extends Schema {
    @type("string") id: string = "";
    @type("string") uid: string = "";
    @type(Vector2Schema) startPos: Vector2Schema = new Vector2Schema();
    @type(Vector2Schema) currentPos: Vector2Schema = new Vector2Schema();
    @type([Vector2Schema]) waypoints = new ArraySchema<Vector2Schema>();
    @type("boolean") ready: boolean = false;
    @type("boolean") connected: boolean = true;
}

export class GameState extends Schema {
    @type("string") phase: string = "WAITING"; // WAITING, SETTING_PATH, MOVING
    @type("number") timer: number = 30;
    @type("number") round: number = 1;
    @type("string") hostSessionId: string = "";
    @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
    @type({ map: NodeSchema }) nodes = new MapSchema<NodeSchema>();
    @type([SegmentSchema]) segments = new ArraySchema<SegmentSchema>();
}
