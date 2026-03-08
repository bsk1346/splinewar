import React from 'react';
import { useNavigate } from 'react-router-dom';

export const Menu: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif' }}>
            <h1 style={{ fontSize: '48px', marginBottom: '40px', color: '#3498db' }}>Neon Spline Wars</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '300px' }}>
                <button
                    onClick={() => navigate('/single')}
                    style={{ padding: '15px 20px', fontSize: '18px', cursor: 'pointer', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '8px', transition: '0.2s' }}
                    onMouseOver={e => e.currentTarget.style.background = '#444'}
                    onMouseOut={e => e.currentTarget.style.background = '#333'}
                >
                    싱글 플레이 (AI 연습모드)
                </button>
                <button
                    onClick={() => navigate('/multi')}
                    style={{ padding: '15px 20px', fontSize: '18px', cursor: 'pointer', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', transition: '0.2s', fontWeight: 'bold' }}
                    onMouseOver={e => e.currentTarget.style.background = '#2980b9'}
                    onMouseOut={e => e.currentTarget.style.background = '#3498db'}
                >
                    온라인 멀티플레이 (로비)
                </button>
            </div>
            <div style={{ marginTop: '50px', color: '#888', fontSize: '14px' }}>
                턴제(Lock-Step) 방식의 스플라인 점령전 게임 프로토타입
            </div>
        </div>
    );
};
