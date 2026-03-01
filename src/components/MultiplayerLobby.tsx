import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Colyseus from 'colyseus.js';
import { MultiplayerRenderer } from './MultiplayerRenderer';
import { GameState } from '../schema/GameState';
import { getColyseusUrl } from '../utils/getColyseusUrl';

export const MultiplayerLobby: React.FC = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<string>('Connecting to Server...');
    const [room, setRoom] = useState<Colyseus.Room | null>(null);
    const [lobbyRoom, setLobbyRoom] = useState<Colyseus.Room | null>(null);
    const [availableRooms, setAvailableRooms] = useState<Colyseus.RoomAvailable[]>([]);
    const [players, setPlayers] = useState<{ sessionId: string, id: string, ready: boolean }[]>([]);
    const [newRoomName, setNewRoomName] = useState<string>('My Game Room');

    const roomRef = useRef<Colyseus.Room | null>(null);
    useEffect(() => {
        roomRef.current = room;
    }, [room]);

    useEffect(() => {
        // UID management for stable reconnection
        let uId = localStorage.getItem('player_uid');
        if (!uId) {
            uId = Math.random().toString(36).substring(2, 11);
            localStorage.setItem('player_uid', uId);
        }

        let pendingDeletions = new Map<string, ReturnType<typeof setInterval>>();
        let isPolling = false;

        const initLobby = async () => {
            const client = new Colyseus.Client(getColyseusUrl());
            try {
                // Instantly run once without waiting for 2s
                const rooms = await client.getAvailableRooms('game_room');
                setAvailableRooms(rooms.filter(r => r.metadata?.active !== false));
            } catch (err) { }

            const pollInterval = setInterval(async () => {
                try {
                    const rooms = await client.getAvailableRooms('game_room');
                    setAvailableRooms(rooms.filter(r => r.metadata?.active !== false));
                } catch (err) {
                    // console.warn("Failed to poll rooms", err);
                }
            }, 2000);

            pendingDeletions.set('poll', pollInterval as any);
            isPolling = true;
        };

        if (!isPolling) {
            initLobby();
        }

        const handleUnload = () => {
            if (roomRef.current) { try { roomRef.current.leave(); } catch (e) { } }
        };

        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('pagehide', handleUnload);
        window.addEventListener('popstate', handleUnload);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            window.removeEventListener('pagehide', handleUnload);
            window.removeEventListener('popstate', handleUnload);
            pendingDeletions.forEach(t => clearInterval(t as any));
            if (roomRef.current) { try { roomRef.current.leave(); } catch (e) { } }
        };
    }, []);

    const refreshLobby = async () => {
        let pendingDeletionsLocal = new Map<string, ReturnType<typeof setInterval>>();

        if (lobbyRoom) {
            try { lobbyRoom.leave(); } catch (e) { }
            setLobbyRoom(null); // Clear state
        }

        const client = new Colyseus.Client(getColyseusUrl());
        try {
            const pollInterval = setInterval(async () => {
                try {
                    const rooms = await client.getAvailableRooms('game_room');
                    setAvailableRooms(rooms.filter(r => r.metadata?.active !== false));
                } catch (err) {
                    // ignore
                }
            }, 2000);

            pendingDeletionsLocal.set('poll', pollInterval as any);
        } catch (e) { }
    };

    const joinGameRoom = (roomId: string | null = null) => {
        let uId = localStorage.getItem('player_uid');
        const client = new Colyseus.Client(getColyseusUrl());

        const joinPromise = roomId
            ? client.joinById<GameState>(roomId, { uid: uId })
            : client.create<GameState>('game_room', { uid: uId, roomName: `${newRoomName} #${Math.floor(Math.random() * 1000)}` });

        joinPromise.then(newRoom => {
            console.log('Joined game room successfully', newRoom.sessionId);
            setStatus(`Joined Room: ${newRoom.roomId}`);
            setRoom(newRoom as any);

            newRoom.onStateChange((state: GameState) => {
                if (state.phase === 'SETTING_PATH' || state.phase === 'MOVING') {
                    setStatus('Game Started!');
                }
            });

            newRoom.state.players.onAdd((player, sessionId) => {
                setPlayers(prev => [...prev.filter(p => p.id !== player.id), { sessionId, id: player.id, ready: player.ready }]);

                player.onChange(() => {
                    setPlayers(prev => prev.map(p =>
                        p.sessionId === sessionId ? { ...p, ready: player.ready } : p
                    ));
                });
            });

            newRoom.state.players.onRemove((_player, sessionId) => {
                setPlayers(prev => prev.filter(p => p.sessionId !== sessionId));
            });

        }).catch(e => {
            console.error('Room Join error', e);
            setStatus(`Failed to join room: ${e.message}`);
        });
    };

    // We no longer need the secondary useEffect for beforeunload/popstate
    // because roomRef covers it in the main init block.

    if (status === 'Game Started!' && room) {
        return <MultiplayerRenderer room={room} />;
    }

    const myPlayer = players.find(p => p.sessionId === room?.sessionId);
    const readyCount = players.filter(p => p.ready).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif' }}>
            <h1 style={{ fontSize: '32px', marginBottom: '20px', color: '#e74c3c' }}>Multiplayer Lobby</h1>

            {!room ? (
                // LOBBY VIEW
                <div style={{ padding: '20px', background: '#222', borderRadius: '8px', border: '1px solid #444', marginBottom: '20px', minWidth: '320px', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#3498db' }}>Select a Match</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                        <input
                            type="text"
                            value={newRoomName}
                            onChange={e => setNewRoomName(e.target.value)}
                            style={{ padding: '10px', borderRadius: '4px', border: 'none', background: '#333', color: 'white' }}
                        />
                        <button
                            onClick={() => joinGameRoom(null)}
                            style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
                        >
                            방 만들기 (Create Room)
                        </button>
                    </div>

                    <div style={{ textAlign: 'left', background: '#111', padding: '10px', borderRadius: '4px', minHeight: '150px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#888' }}>Available Rooms</h4>
                        {availableRooms.length === 0 && <span style={{ color: '#555' }}>No active rooms found.</span>}
                        {availableRooms.map(r => (
                            <div key={r.roomId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #333' }}>
                                <span>{r.metadata?.roomName || r.roomId} ({r.clients}/4)</span>
                                <button
                                    onClick={() => joinGameRoom(r.roomId)}
                                    disabled={r.clients >= 4}
                                    style={{ padding: '5px 15px', cursor: r.clients >= 4 ? 'not-allowed' : 'pointer', background: r.clients >= 4 ? '#555' : '#3498db', color: 'white', border: 'none', borderRadius: '4px' }}
                                >
                                    Join
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                // INSIDE ROOM LOBBY VIEW
                <div style={{ padding: '20px', background: '#222', borderRadius: '8px', border: '1px solid #444', marginBottom: '20px', minWidth: '300px', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#3498db' }}>{status}</h3>

                    <div style={{ textAlign: 'left', marginBottom: '15px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#888' }}>Players ({players.length}/4) - Ready: {readyCount}/{players.length}</h4>
                        {players.map(p => (
                            <div key={p.sessionId} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #333' }}>
                                <span>{p.id} {p.sessionId === room?.sessionId ? "(You)" : ""}</span>
                                <span style={{ color: p.ready ? '#2ecc71' : '#e74c3c' }}>
                                    {p.ready ? "🟢 Ready" : "🔴 Not Ready"}
                                </span>
                            </div>
                        ))}
                    </div>

                    {players.length >= 2 ? (
                        <button
                            onClick={() => room?.send("toggleReady")}
                            style={{ padding: '12px 20px', fontSize: '18px', cursor: 'pointer', background: myPlayer?.ready ? '#e67e22' : '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', width: '100%', fontWeight: 'bold' }}
                        >
                            {myPlayer?.ready ? "취소 (Cancel Ready)" : "준비 (Ready to Start)"}
                        </button>
                    ) : (
                        <div style={{ padding: '10px', color: '#888', fontStyle: 'italic' }}>
                            경기를 시작하려면 최소 2명의 플레이어가 필요합니다.<br />
                            (방에는 혼자 대기 가능)
                        </div>
                    )}
                </div>
            )}

            <button
                onClick={() => {
                    if (room) {
                        room.leave();
                        setRoom(null);
                        setPlayers([]);
                        setStatus('Select a Match');
                        refreshLobby();
                    }
                    else navigate('/');
                }}
                style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#555', color: 'white', border: 'none', borderRadius: '4px' }}
            >
                {room ? "방 나가기 (Leave Room)" : "메인 메뉴로 돌아가기"}
            </button>
        </div>
    );
};
