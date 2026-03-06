export class SpeedManager {
    public buffCombo: number = 0; // 일반 점령지 (c)
    public stealCombo: number = 0; // 적군 강탈 (e)
    public debuffCombo: number = 0; // 선분 충돌 (d)

    public buffTimer: number = 0;
    public stealTimer: number = 0;
    public debuffTimer: number = 0;

    public updateCombos(dt: number) {
        if (this.buffTimer > 0) {
            this.buffTimer -= dt;
            if (this.buffTimer <= 0) {
                this.buffCombo = 0;
                this.buffTimer = 0;
            }
        }
        if (this.stealTimer > 0) {
            this.stealTimer -= dt;
            if (this.stealTimer <= 0) {
                this.stealCombo = 0;
                this.stealTimer = 0;
            }
        }
        if (this.debuffTimer > 0) {
            this.debuffTimer -= dt;
            if (this.debuffTimer <= 0) {
                this.debuffCombo = 0;
                this.debuffTimer = 0;
            }
        }
    }

    public triggerBuff() {
        this.buffTimer = 0.8;
        this.buffCombo += 1;
    }

    public triggerStealBuff() {
        this.stealTimer = 0.8;
        this.stealCombo += 1;
    }

    public triggerDebuff() {
        this.debuffTimer = 0.8;
        this.debuffCombo += 1;
    }

    public calculateCurrentSpeed(
        n: number, // 실시간 아군 점령지 갯수
        m: number, // 실시간 적군 최고 점령지 갯수 (단일 적) 또는 전체 적군의 점령지(이 게임은 후자로 통일)
        hasPenaltyTimeRemaining: boolean
    ): number {
        // Vorigin = 4
        let origin = 4;
        if (hasPenaltyTimeRemaining) origin *= 0.8; // 패널티

        // Vbase = Vorigin + 3n/20
        const vBase = origin + (3 * n / 20);

        let vCurrent = vBase * Math.pow(1.15, this.buffCombo) * Math.pow(0.7, this.debuffCombo);

        if (m > n) {
            // 강탈 시 역전 폭발 가중치
            const multiplier = 1.05 * ((100 + (m - n)) / 100);
            vCurrent *= Math.pow(multiplier, this.stealCombo);
        } else {
            // 일반 강탈 효과
            vCurrent *= Math.pow(1.05, this.stealCombo);
        }

        return vCurrent;
    }

    public resetPhase() {
        this.buffCombo = 0;
        this.stealCombo = 0;
        this.debuffCombo = 0;

        this.buffTimer = 0;
        this.stealTimer = 0;
        this.debuffTimer = 0;
    }
}
