import { Room, Client } from "colyseus";
import { GameState, PlayerSchema, Vector2Schema, NodeSchema } from "./schema/GameState";
import { ServerGameLoop } from "./ServerGameLoop";

type PlayerId = "P1" | "P2" | "P3" | "P4";
const PLAYER_IDS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];
function getGridPos(i: number, j: number) {
    const offsetI = i - 4;
    const offsetJ = j - 4;
    const x = (offsetI - offsetJ) * 5 * Math.cos(Math.PI / 4);
    const y = (offsetI + offsetJ) * 5 * Math.sin(Math.PI / 4);
    return { x, y };
}

const START_POSITIONS = [
    getGridPos(0, 8), // P1 at grid (0,8)
    getGridPos(8, 0), // P2 at grid (8,0)
    getGridPos(0, 0), // P3 at grid (0,0)
    getGridPos(8, 8)  // P4 at grid (8,8)
];

export class GameRoom extends Room<GameState> {
    maxClients = 4;
    private timerInterval!: NodeJS.Timeout;
    private hiddenWaypoints = new Map<string, { x: number, y: number }[]>();
    private disconnectedTimeout = new Map<string, NodeJS.Timeout>();
    private gameLoop!: ServerGameLoop;
    private displayRoomName: string = "";

    onCreate(options: any) {
        this.setState(new GameState());

        // Initialize Map
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const offsetI = i - 4;
                const offsetJ = j - 4;
                const x = (offsetI - offsetJ) * 5 * Math.cos(Math.PI / 4);
                const y = (offsetI + offsetJ) * 5 * Math.sin(Math.PI / 4);
                const id = `${i},${j}`;

                const isP1Base = (i === 0 && j === 8);
                const isP2Base = (i === 8 && j === 0);
                const isP3Base = (i === 0 && j === 0);
                const isP4Base = (i === 8 && j === 8);
                const isBase = isP1Base || isP2Base || isP3Base || isP4Base;

                const node = new NodeSchema();
                node.id = id;
                node.gridI = i;
                node.gridJ = j;
                node.pos.x = x;
                node.pos.y = y;
                node.owner = "";
                node.capturedThisRound = false;
                node.isBase = isBase;

                this.state.nodes.set(id, node);
            }
        }

        this.gameLoop = new ServerGameLoop(this.state, () => {
            // Callback when MOVING is finished
            this.state.round += 1;
            this.startPathSettingPhase();
        });

        this.displayRoomName = options.roomName || `Room ${this.roomId}`;
        this.setMetadata({ roomName: this.displayRoomName, active: true });

        this.onMessage("submitWaypoints", (client, message: { waypoints: { x: number, y: number }[] }) => {
            const playerPath = this.state.players.get(client.sessionId);
            if (playerPath && this.state.phase === "SETTING_PATH") {
                this.hiddenWaypoints.set(client.sessionId, message.waypoints);
                playerPath.ready = true;
                this.checkAllReady();
            }
        });

        this.onMessage("playAgain", (client) => {
            if (this.state.phase === "FINISHED") {
                this.resetGame();
            }
        });

        this.onMessage("animFinished", (client) => {
            // No longer used, handled by ServerGameLoop fully
        });

        this.onMessage("submitAgentWaypoints", (client, message: { targetId: string, waypoints: { x: number, y: number }[] }) => {
            if (this.state.phase !== "SETTING_PATH") return;
            let targetSessionId: string | null = null;
            let targetPlayer: PlayerSchema | null = null;
            this.state.players.forEach((p, sId) => {
                if (p.id === message.targetId && !p.connected) {
                    targetSessionId = sId;
                    targetPlayer = p;
                }
            });
            if (targetSessionId && targetPlayer) {
                this.hiddenWaypoints.set(targetSessionId, message.waypoints);
                (targetPlayer as PlayerSchema).ready = true;
                this.checkAllReady();
            }
        });

        this.onMessage("toggleReady", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (player && this.state.phase === "WAITING") {
                player.ready = !player.ready;
                this.checkLobbyReady();
            }
        });
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        const uid = options.uid || client.sessionId;

        let reconnectedId: string | null = null;
        let oldSessionId: string | null = null;

        this.state.players.forEach((p, sId) => {
            if (p.uid === uid && !p.connected) {
                reconnectedId = p.id;
                oldSessionId = sId;
            }
        });

        if (reconnectedId && oldSessionId) {
            const prevPlayer = this.state.players.get(oldSessionId)!;
            const newPlayer = new PlayerSchema();
            newPlayer.id = prevPlayer.id;
            newPlayer.uid = uid;
            newPlayer.startPos.x = prevPlayer.startPos.x;
            newPlayer.startPos.y = prevPlayer.startPos.y;
            newPlayer.connected = true;
            newPlayer.ready = prevPlayer.ready;

            this.state.players.delete(oldSessionId);
            this.state.players.set(client.sessionId, newPlayer);
            console.log(`Player ${newPlayer.id} reconnected under new sessionId ${client.sessionId}`);
            // Clear any pending disconnection timeout for this player
            if (this.disconnectedTimeout.has(oldSessionId)) {
                clearTimeout(this.disconnectedTimeout.get(oldSessionId));
                this.disconnectedTimeout.delete(oldSessionId);
            }
            this.checkLobbyReady();
            return;
        }

        const activeIds = Array.from(this.state.players.values()).map(p => p.id);
        const availableIds = PLAYER_IDS.filter(id => !activeIds.includes(id));
        if (availableIds.length === 0) {
            client.leave(1000);
            return;
        }

        const pId = availableIds[0];
        const playerIndex = PLAYER_IDS.indexOf(pId);

        const player = new PlayerSchema();
        player.id = pId;
        player.uid = uid;

        // We defer exact start positions to the client logic or sync it roughly
        player.startPos.x = START_POSITIONS[playerIndex]?.x || 0;
        player.startPos.y = START_POSITIONS[playerIndex]?.y || 0;
        player.currentPos.x = player.startPos.x;
        player.currentPos.y = player.startPos.y;

        this.state.players.set(client.sessionId, player);

        if (!this.state.hostSessionId) {
            this.state.hostSessionId = client.sessionId;
            console.log(`Assigned initial host: ${client.sessionId}`);
        }

        this.checkLobbyReady();
    }

    onLeave(client: Client, consented?: boolean) {
        console.log(client.sessionId, "left!");
        const player = this.state.players.get(client.sessionId);
        if (player) {
            player.connected = false;
            player.ready = false;
        }

        if (this.state.phase === "WAITING") {
            this.state.players.delete(client.sessionId);
            this.migrateHostIfNecessary(client.sessionId);
            this.checkLobbyReady();
        } else {
            // Give 30 seconds for reconnect during active match, otherwise delete
            const timeout = setTimeout(() => {
                this.state.players.delete(client.sessionId);
                this.disconnectedTimeout.delete(client.sessionId);

                this.migrateHostIfNecessary(client.sessionId);

                // If everyone is disconnected in a match, disconnect room
                const allDisconnected = Array.from(this.state.players.values()).every(p => !p.connected);
                if (allDisconnected) {
                    this.disconnect();
                }
            }, 30000);
            this.disconnectedTimeout.set(client.sessionId, timeout);

            // Still migrate host immediately to avoid AI generation gap
            this.migrateHostIfNecessary(client.sessionId);
        }

        // Check if room needs immediate disposal
        const activeCount = Array.from(this.state.players.values()).filter(p => p.connected).length;
        if (activeCount === 0) {
            this.disconnect();
        }
    }

    private getActiveIds(): PlayerId[] {
        const ids: PlayerId[] = [];
        this.state.players.forEach((p) => {
            if (p.connected) ids.push(p.id as PlayerId);
        });
        return ids;
    }

    private migrateHostIfNecessary(leftSessionId: string) {
        if (this.state.hostSessionId === leftSessionId) {
            // Find a new connected player
            let newHost: string | null = null;
            this.state.players.forEach((p, sId) => {
                if (p.connected && !newHost) {
                    newHost = sId;
                }
            });

            if (newHost) {
                this.state.hostSessionId = newHost;
                console.log(`Host migrated from ${leftSessionId} to ${newHost}`);
            } else {
                this.state.hostSessionId = "";
            }
        }
    }

    onDispose() {
        console.log("room", this.roomId, "disposing...");
        clearInterval(this.timerInterval);
        this.disconnectedTimeout.forEach((timeout) => clearTimeout(timeout));
        this.disconnectedTimeout.clear();
        if (this.gameLoop) {
            this.gameLoop.dispose();
        }
    }

    private startPathSettingPhase() {
        if (this.state.round > 7) {
            console.log("Game Over! Round > 7");
            this.state.phase = "FINISHED";
            this.state.timer = 0;
            clearInterval(this.timerInterval);
            return;
        }

        console.log("Starting Path Setting Phase (Round " + this.state.round + ")");

        // Update isBase for corners based on actually connected players.
        // P1 is always 0,8. P2 is 8,0. P3 is 0,0. P4 is 8,8.
        const activeIds = this.getActiveIds();
        this.state.nodes.forEach(node => {
            if (node.gridI === 0 && node.gridJ === 8) { node.isBase = true; } // P1 always exists
            else if (node.gridI === 8 && node.gridJ === 0) { node.isBase = activeIds.includes('P2'); }
            else if (node.gridI === 0 && node.gridJ === 0) { node.isBase = activeIds.includes('P3'); }
            else if (node.gridI === 8 && node.gridJ === 8) { node.isBase = activeIds.includes('P4'); }
        });

        this.hiddenWaypoints.clear();
        this.state.phase = "SETTING_PATH";
        this.state.timer = 30.0;
        this.state.players.forEach((p: PlayerSchema) => {
            p.ready = false;
            p.waypoints.clear();
        });

        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.state.timer -= 1;
            if (this.state.timer <= 0) {
                // Force sync and move
                this.forceStartMovingPhase();
            }
        }, 1000);
    }

    private checkAllReady() {
        let allReady = true;
        this.state.players.forEach((p: PlayerSchema) => {
            if (p.connected && !p.ready) allReady = false;
        });

        if (allReady && this.state.phase === "SETTING_PATH") {
            this.forceStartMovingPhase();
        }
    }

    private checkLobbyReady() {
        if (this.state.phase !== "WAITING") return;

        let connectedCount = 0;
        let readyCount = 0;

        this.state.players.forEach((p: PlayerSchema) => {
            if (p.connected) {
                connectedCount++;
                if (p.ready) readyCount++;
            }
        });

        // Start if 2 or more players are connected and ALL of them are ready
        if (connectedCount >= 2 && readyCount === connectedCount) {
            // Small delay to let clients see the final "Ready" state before jumping
            setTimeout(() => {
                if (this.state.phase === "WAITING") {
                    this.startPathSettingPhase();
                }
            }, 500);
        }
    }

    private forceStartMovingPhase() {
        console.log("Broadcasting move command");
        clearInterval(this.timerInterval);
        this.state.phase = "MOVING";
        this.setMetadata({ roomName: this.displayRoomName, active: false }); // Hide from lobby once moving

        // Transfer hidden waypoints to public schema
        this.hiddenWaypoints.forEach((wps, sessionId) => {
            const player = this.state.players.get(sessionId);
            if (player) {
                player.waypoints.clear();
                wps.forEach(wp => {
                    const vec = new Vector2Schema();
                    vec.x = wp.x;
                    vec.y = wp.y;
                    player.waypoints.push(vec);
                });
            }
        });

        this.gameLoop.startMoving();
    }

    private resetGame() {
        this.state.round = 1;
        this.state.phase = "WAITING";
        this.state.timer = 30;
        this.state.segments.clear();
        this.state.nodes.forEach(n => {
            n.owner = "";
            n.capturedThisRound = false;
        });

        const activeIds = Array.from(this.state.players.values()).map(p => p.id);

        this.state.players.forEach((p) => {
            p.ready = false;
            p.waypoints.clear();
            const playerIndex = PLAYER_IDS.indexOf(p.id as PlayerId);
            p.startPos.x = START_POSITIONS[playerIndex]?.x || 0;
            p.startPos.y = START_POSITIONS[playerIndex]?.y || 0;
            p.currentPos.x = p.startPos.x;
            p.currentPos.y = p.startPos.y;
        });

        this.setMetadata({ roomName: this.displayRoomName, active: true });
        this.checkLobbyReady();
    }

    private checkAllAnimFinished() {
        let allFinished = true;
        this.state.players.forEach((p: PlayerSchema) => {
            if (p.connected && p.ready) allFinished = false; // Using ready=false as finished flag
        });

        if (allFinished && this.state.phase === "MOVING") {
            this.state.round += 1;
            this.startPathSettingPhase();
        }
    }
}
