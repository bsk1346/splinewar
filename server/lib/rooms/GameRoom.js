"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const colyseus_1 = require("colyseus");
const GameState_1 = require("./schema/GameState");
const PLAYER_IDS = ['P1', 'P2', 'P3', 'P4'];
const START_POSITIONS = [
    { x: -5, y: 5 }, // P1 logic approx (0,8)
    { x: 5, y: -5 }, // P2 approx (8,0)
    { x: -5, y: -5 }, // P3 approx (0,0)
    { x: 5, y: 5 } // P4 approx (8,8)
];
class GameRoom extends colyseus_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 4;
        this.hiddenWaypoints = new Map();
        this.disconnectedTimeout = new Map();
    }
    onCreate(options) {
        this.setState(new GameState_1.GameState());
        const roomName = options.roomName || `Room ${this.roomId}`;
        this.setMetadata({ roomName, active: true });
        this.onMessage("submitWaypoints", (client, message) => {
            const playerPath = this.state.players.get(client.sessionId);
            if (playerPath && this.state.phase === "SETTING_PATH") {
                this.hiddenWaypoints.set(client.sessionId, message.waypoints);
                playerPath.ready = true;
                this.checkAllReady();
            }
        });
        this.onMessage("animFinished", (client) => {
            const playerPath = this.state.players.get(client.sessionId);
            if (playerPath && this.state.phase === "MOVING") {
                playerPath.ready = false; // Reset for next setting phase
            }
            this.checkAllAnimFinished();
        });
        this.onMessage("submitAgentWaypoints", (client, message) => {
            if (this.state.phase !== "SETTING_PATH")
                return;
            let targetSessionId = null;
            let targetPlayer = null;
            this.state.players.forEach((p, sId) => {
                if (p.id === message.targetId && !p.connected) {
                    targetSessionId = sId;
                    targetPlayer = p;
                }
            });
            if (targetSessionId && targetPlayer) {
                this.hiddenWaypoints.set(targetSessionId, message.waypoints);
                targetPlayer.ready = true;
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
    onJoin(client, options) {
        var _a, _b;
        console.log(client.sessionId, "joined!");
        const uid = options.uid || client.sessionId;
        let reconnectedId = null;
        let oldSessionId = null;
        this.state.players.forEach((p, sId) => {
            if (p.uid === uid && !p.connected) {
                reconnectedId = p.id;
                oldSessionId = sId;
            }
        });
        if (reconnectedId && oldSessionId) {
            const prevPlayer = this.state.players.get(oldSessionId);
            const newPlayer = new GameState_1.PlayerSchema();
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
        const player = new GameState_1.PlayerSchema();
        player.id = pId;
        player.uid = uid;
        // We defer exact start positions to the client logic or sync it roughly
        player.startPos.x = ((_a = START_POSITIONS[playerIndex]) === null || _a === void 0 ? void 0 : _a.x) || 0;
        player.startPos.y = ((_b = START_POSITIONS[playerIndex]) === null || _b === void 0 ? void 0 : _b.y) || 0;
        this.state.players.set(client.sessionId, player);
        if (!this.state.hostSessionId) {
            this.state.hostSessionId = client.sessionId;
            console.log(`Assigned initial host: ${client.sessionId}`);
        }
        this.checkLobbyReady();
    }
    onLeave(client, consented) {
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
        }
        else {
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
    migrateHostIfNecessary(leftSessionId) {
        if (this.state.hostSessionId === leftSessionId) {
            // Find a new connected player
            let newHost = null;
            this.state.players.forEach((p, sId) => {
                if (p.connected && !newHost) {
                    newHost = sId;
                }
            });
            if (newHost) {
                this.state.hostSessionId = newHost;
                console.log(`Host migrated from ${leftSessionId} to ${newHost}`);
            }
            else {
                this.state.hostSessionId = "";
            }
        }
    }
    onDispose() {
        console.log("room", this.roomId, "disposing...");
        clearInterval(this.timerInterval);
    }
    startPathSettingPhase() {
        if (this.state.round > 7) {
            console.log("Game Over! Round > 7");
            this.state.phase = "FINISHED";
            this.state.timer = 0;
            clearInterval(this.timerInterval);
            return;
        }
        console.log("Starting Path Setting Phase (Round " + this.state.round + ")");
        this.hiddenWaypoints.clear();
        this.state.phase = "SETTING_PATH";
        this.state.timer = 30.0;
        this.state.players.forEach((p) => {
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
    checkAllReady() {
        let allReady = true;
        this.state.players.forEach((p) => {
            if (p.connected && !p.ready)
                allReady = false;
        });
        if (allReady && this.state.phase === "SETTING_PATH") {
            this.forceStartMovingPhase();
        }
    }
    checkLobbyReady() {
        if (this.state.phase !== "WAITING")
            return;
        let connectedCount = 0;
        let readyCount = 0;
        this.state.players.forEach((p) => {
            if (p.connected) {
                connectedCount++;
                if (p.ready)
                    readyCount++;
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
    forceStartMovingPhase() {
        console.log("Broadcasting move command");
        clearInterval(this.timerInterval);
        this.state.phase = "MOVING";
        this.setMetadata({ roomName: this.metadata.roomName, active: false }); // Hide from lobby once moving
        // Transfer hidden waypoints to public schema
        this.hiddenWaypoints.forEach((wps, sessionId) => {
            const player = this.state.players.get(sessionId);
            if (player) {
                player.waypoints.clear();
                wps.forEach(wp => {
                    const vec = new GameState_1.Vector2Schema();
                    vec.x = wp.x;
                    vec.y = wp.y;
                    player.waypoints.push(vec);
                });
            }
        });
        // Let the clients figure out animation for 5 seconds
        // Once they finish, they'll send animFinished.
        // As a fallback, server sets a timer to resume SETTING_PATH after 5 + grace seconds 
        setTimeout(() => {
            if (this.state.phase === "MOVING") {
                this.startPathSettingPhase();
                this.state.round += 1;
            }
        }, 6000); // 5s move + 1s grace
    }
    checkAllAnimFinished() {
        let allFinished = true;
        this.state.players.forEach((p) => {
            if (p.connected && p.ready)
                allFinished = false; // Using ready=false as finished flag
        });
        if (allFinished && this.state.phase === "MOVING") {
            this.state.round += 1;
            this.startPathSettingPhase();
        }
    }
}
exports.GameRoom = GameRoom;
