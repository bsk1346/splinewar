import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class Vector2Schema extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
}

export class PlayerSchema extends Schema {
    @type("string") id: string = "";
    @type(Vector2Schema) startPos: Vector2Schema = new Vector2Schema();
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
}
