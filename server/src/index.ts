import http from "http";
import express from "express";
import cors from "cors";
import { Server, LobbyRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { GameRoom } from "./rooms/GameRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const gameServer = new Server({
    transport: new WebSocketTransport({
        server
    })
});

// Register Rooms
gameServer.define("lobby", LobbyRoom);
gameServer.define("game_room", GameRoom).enableRealtimeListing();

// Start Server
gameServer.listen(port).then(() => {
    console.log(`🎮 Game Server is active on port ${port}`);
});
