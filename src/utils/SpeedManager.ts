export class SpeedManager {
    public buffCombo: number = 0;       // 일반 점령지 (c)
    public stealCombo: number = 0;      // 적군 강탈 (e)
    public allyLineCombo: number = 0;   // 아군 선분 (f) - 기획 추가됨
    public debuffCombo: number = 0;     // 선분 충돌 (d)

    // 외부 코드 참조 호환성을 위해 개별 타이머 변수를 유지합니다.
    // 단, 긍정적인 행동(c, e, f)은 내부적으로 항상 같은 값을 가지도록 동기화됩니다.
    public buffTimer: number = 0;
    public stealTimer: number = 0;
    public allyLineTimer: number = 0;   // 기획 추가됨
    public debuffTimer: number = 0;

    public updateCombos(dt: number) {
        // c, e, f는 사기증강 그룹(g)으로 묶여 동일한 타이머를 공유합니다.
        // buffTimer만 체크해도 무방하나, 직관성과 안전성을 위해 모두 감소시킵니다.
        if (this.buffTimer > 0) {
            this.buffTimer -= dt;
            this.stealTimer -= dt;
            this.allyLineTimer -= dt;
            
            // 공통 타이머가 0이 되면 c, e, f를 모두 0으로 초기화
            if (this.buffTimer <= 0) {
                this.buffCombo = 0;
                this.stealCombo = 0;
                this.allyLineCombo = 0;
                
                this.buffTimer = 0;
                this.stealTimer = 0;
                this.allyLineTimer = 0;
            }
        }
        
        // 사기감소(d) 타이머는 독립적으로 동작
        if (this.debuffTimer > 0) {
            this.debuffTimer -= dt;
            if (this.debuffTimer <= 0) {
                this.debuffCombo = 0;
                this.debuffTimer = 0;
            }
        }
    }

    // --- 사기증강(g) 발생 시 모든 긍정적 타이머를 T초로 일괄 갱신하는 헬퍼 함수 ---
    private renewPositiveTimers(n: number) {
        const t = 0.8 + (n / 100);
        this.buffTimer = t;
        this.stealTimer = t;
        this.allyLineTimer = t;
    }

    // 주의: 타이머(T) 계산에 영토 갯수(n)가 필요하므로 매개변수 n이 추가되었습니다.
    public triggerBuff(n: number) {
        this.buffCombo += 1;
        this.renewPositiveTimers(n);
    }

    public triggerStealBuff(n: number) {
        this.stealCombo += 1;
        this.renewPositiveTimers(n);
    }

    public triggerAllyLineBuff(n: number) {
        this.allyLineCombo += 1;
        this.renewPositiveTimers(n);
    }

    public triggerDebuff(n: number) {
        this.debuffCombo += 1;
        this.debuffTimer = 0.8 + (n / 100);
    }

    public calculateCurrentSpeed(
        n: number, // 실시간 아군 점령지 갯수
        m: number, // 실시간 적군 점령지 갯수
        r: number, // 현재 라운드 (기획 추가됨)
        hasPenaltyTimeRemaining: boolean // 기존 호환성을 위해 파라미터 유지
    ): number {
        let origin = 4;
        // 기존 패널티 로직 (공식에는 명시되지 않았으나 기존 호환성을 위해 유지, 필요시 삭제)
        if (hasPenaltyTimeRemaining) origin *= 0.8; 

        // Vbase = Vorigin + n/10 + r/8
        const vBase = origin + (n / 10) + (r / 8);

        // 각 콤보별 배율 계산
        const buffMultiplier = Math.pow(1.1, this.buffCombo);                     // (1.1)^c
        const debuffBase = 0.7 + (n / 200);                                       
        const debuffMultiplier = Math.pow(debuffBase, this.debuffCombo);          // (0.7 + n/200)^d
        const allyLineMultiplier = Math.pow(1.1, this.allyLineCombo);            // (1.1)^f

        // 긍정적/부정적 요소를 모두 곱함
        let vCurrent = vBase * buffMultiplier * debuffMultiplier * allyLineMultiplier;

        // 적군 강탈(e) 역전 보정 요소 적용
        if (m > n) {
            const stealMultiplier = 1.05 * ((105 + (m - n)) / 100);
            vCurrent *= Math.pow(stealMultiplier, this.stealCombo);
        } else {
            vCurrent *= Math.pow(1.05, this.stealCombo);
        }

        return vCurrent;
    }

    public resetPhase() {
        this.buffCombo = 0;
        this.stealCombo = 0;
        this.allyLineCombo = 0;
        this.debuffCombo = 0;

        this.buffTimer = 0;
        this.stealTimer = 0;
        this.allyLineTimer = 0;
        this.debuffTimer = 0;
    }
}

