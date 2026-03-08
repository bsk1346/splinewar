import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

interface AudioContextType {
    isPlaying: boolean;
    playMusic: () => void;
    pauseMusic: () => void;
    toggleMusic: () => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const useAudio = () => {
    const ctx = useContext(AudioContext);
    if (!ctx) throw new Error('useAudio must be used within an AudioProvider');
    return ctx;
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // We start as false but will sync state if interaction succeeds
    const initialized = useRef(false);

    useEffect(() => {
        // Safe robust audio element setup 
        const audio = new Audio('/audio/bgm/bgm_loop.m4a');
        audio.loop = true;
        audio.volume = 0.4;
        audioRef.current = audio;

        const syncPlayState = () => setIsPlaying(!audio.paused);
        audio.addEventListener('play', syncPlayState);
        audio.addEventListener('pause', syncPlayState);

        return () => {
            audio.removeEventListener('play', syncPlayState);
            audio.removeEventListener('pause', syncPlayState);
            audio.pause();
            audioRef.current = null;
        };
    }, []);

    const playMusic = () => {
        if (!audioRef.current) return;
        // The play() promise rejection is normal if browser blocked it
        audioRef.current.play().catch(e => console.warn('Audio auto-play blocked by browser policy:', e));
        initialized.current = true;
    };

    const pauseMusic = () => {
        if (!audioRef.current) return;
        audioRef.current.pause();
    };

    const toggleMusic = () => {
        if (!audioRef.current) return;
        if (audioRef.current.paused) {
            playMusic();
        } else {
            pauseMusic();
        }
    };

    // Global listener to capture the very first user interaction to bootstrap audio
    // This solves iOS Safari restrictions where audio must be started within a trusted event
    useEffect(() => {
        const handleFirstInteraction = () => {
            if (!initialized.current && audioRef.current) {
                // Attempt to play silently on first click anywhere
                playMusic();
            }
            // Once we have a user interaction, we can remove the global listeners
            document.removeEventListener('click', handleFirstInteraction);
            document.removeEventListener('touchstart', handleFirstInteraction);
        };

        document.addEventListener('click', handleFirstInteraction);
        document.addEventListener('touchstart', handleFirstInteraction);

        return () => {
            document.removeEventListener('click', handleFirstInteraction);
            document.removeEventListener('touchstart', handleFirstInteraction);
        };
    }, []);

    return (
        <AudioContext.Provider value={{ isPlaying, playMusic, pauseMusic, toggleMusic }}>
            {children}
            {/* Optional visible toggle anywhere on screen if desired */}
            <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
                <button
                    onClick={toggleMusic}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        backdropFilter: 'blur(4px)',
                        color: 'white',
                        padding: '10px 15px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px'
                    }}
                >
                    {isPlaying ? '🔊 BGM On' : '🔈 BGM Off'}
                </button>
            </div>
        </AudioContext.Provider>
    );
};
