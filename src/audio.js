// 全合成音频：SFX 分层音效 + 程序化 BGM，无需任何音频资源文件
export class SFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._lastShot = 0;
    this._bgmTimer = null;
    this._bgmStep = 0;
    this._bgmNext = 0;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.75;
      this.sfxBus.connect(this.master);

      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = 0.3;
      this.bgmBus.connect(this.master);

      // 共享噪声源，避免每次分配大 buffer
      const len = this.ctx.sampleRate * 1.2;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this._loadSamples();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // 加载采样音效（击杀僵尸 = 果汁四溅）
  async _loadSamples() {
    this.samples = {};
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'sfx/juice-splash.wav');
      const raw = await res.arrayBuffer();
      this.samples.splash = await this.ctx.decodeAudioData(raw);
    } catch {
      // 加载失败则继续用合成音效兜底
    }
  }

  _playSample(buf, { vol = 1, rate = 1, delay = 0 } = {}) {
    if (!this.ctx || !buf) return false;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    src.start(t);
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  // ---------------- 基础合成单元 ----------------
  _tone({ freq = 440, dur = 0.12, type = 'square', vol = 0.2, slideTo = 0, delay = 0, attack = 0.002, bus = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise({ dur = 0.12, vol = 0.12, freq = 900, type = 'bandpass', Q = 1, slideTo = 0, delay = 0, bus = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    filter.Q.value = Q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------------- 开火音效（按武器分层设计） ----------------
  shot(kind = 'rifle') {
    const now = performance.now();
    const minGap = kind === 'minigun' ? 45 : 70;
    if (now - this._lastShot < minGap) return;
    this._lastShot = now;

    if (kind === 'rifle') {
      // 清脆的"哒"：高频噪声瞬态 + 中低频枪身共鸣
      this._noise({ dur: 0.06, vol: 0.1, freq: 2600, Q: 0.8, slideTo: 1200 });
      this._tone({ freq: 170, dur: 0.06, type: 'square', vol: 0.1, slideTo: 90 });
    } else if (kind === 'shotgun') {
      // 沉闷的"砰"：低频噪声 + 下潜低音
      this._noise({ dur: 0.2, vol: 0.2, freq: 750, type: 'lowpass', slideTo: 220 });
      this._tone({ freq: 110, dur: 0.16, type: 'sine', vol: 0.24, slideTo: 45 });
    } else if (kind === 'minigun') {
      // 高速"哒哒哒"：更短更细的瞬态
      this._noise({ dur: 0.035, vol: 0.08, freq: 3200, Q: 1.2 });
      this._tone({ freq: 220, dur: 0.03, type: 'square', vol: 0.05, slideTo: 140 });
    } else if (kind === 'rocket') {
      // 发射"咻——"：噪声扫频
      this._noise({ dur: 0.35, vol: 0.16, freq: 350, type: 'lowpass', slideTo: 1600 });
      this._tone({ freq: 90, dur: 0.25, type: 'sawtooth', vol: 0.1, slideTo: 160 });
    } else if (kind === 'tesla') {
      // 电弧"滋啦"
      this._noise({ dur: 0.07, vol: 0.12, freq: 5200, type: 'highpass' });
      this._tone({ freq: 1600 + Math.random() * 800, dur: 0.05, type: 'square', vol: 0.06, slideTo: 400 });
    } else if (kind === 'flamer') {
      // 火焰喷射的低沉呼呼声
      this._noise({ dur: 0.18, vol: 0.09, freq: 600, type: 'lowpass', slideTo: 300 });
    }
  }

  laser() {
    // 全屏激光：上升的能量蜂鸣 + 持续束流
    this._tone({ freq: 220, dur: 1.1, type: 'sawtooth', vol: 0.2, slideTo: 1400, attack: 0.05 });
    this._tone({ freq: 440, dur: 1.1, type: 'sine', vol: 0.14, slideTo: 2800, attack: 0.05 });
    this._noise({ dur: 1.0, vol: 0.08, freq: 3000, type: 'highpass' });
  }

  freeze() {
    // 冰晶凝结的清脆声
    [1800, 2400, 3200].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.3, type: 'sine', vol: 0.12, delay: i * 0.07, attack: 0.02 }));
    this._noise({ dur: 0.5, vol: 0.05, freq: 6000, type: 'highpass' });
  }

  explosion() {
    const now = performance.now();
    if (now - (this._lastBoom || 0) < 90) return;
    this._lastBoom = now;
    // 三层：冲击波瞬态 → 轰鸣主体 → 余烬碎响
    this._noise({ dur: 0.08, vol: 0.3, freq: 2400, type: 'lowpass', slideTo: 400 });
    this._noise({ dur: 0.55, vol: 0.26, freq: 480, type: 'lowpass', slideTo: 70, delay: 0.02 });
    this._tone({ freq: 78, dur: 0.55, type: 'sine', vol: 0.34, slideTo: 24 });
    this._noise({ dur: 0.3, vol: 0.06, freq: 3400, type: 'highpass', delay: 0.12 });
  }

  // ---------------- 其他事件音效 ----------------
  gateTick() { this._tone({ freq: 1250, dur: 0.05, type: 'sine', vol: 0.05 }); }

  gateCharge() {
    this._tone({ freq: 880, dur: 0.07, type: 'triangle', vol: 0.08 });
  }

  gateReady() {
    [660, 880, 1320].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.12, type: 'triangle', vol: 0.2, delay: i * 0.06 }));
  }

  gateGood() {
    this._tone({ freq: 520, dur: 0.1, type: 'triangle', vol: 0.24 });
    this._tone({ freq: 780, dur: 0.14, type: 'triangle', vol: 0.24, delay: 0.08 });
    this._noise({ dur: 0.12, vol: 0.05, freq: 4000, type: 'highpass' });
  }

  gateBad() {
    this._tone({ freq: 320, dur: 0.18, type: 'sawtooth', vol: 0.2, slideTo: 130 });
    this._noise({ dur: 0.15, vol: 0.07, freq: 500, type: 'lowpass' });
  }

  /**
   * 果汁四溅采样（来自 sc.chinaz.com 200417268201），随机变调避免重复感。
   * @param {number} dist 击杀点到小队的距离，越远音量越小
   */
  zombieDie(dist = 0) {
    const now = performance.now();
    if (now - (this._lastZDie || 0) < 70) return;
    this._lastZDie = now;
    // 距离衰减：贴脸 1.0，35 米外衰减到 0.12
    const att = Math.max(0.12, 1 - dist / 35);
    if (this._playSample(this.samples?.splash, { vol: 0.5 * att, rate: 0.9 + Math.random() * 0.3 })) return;
    // 采样未就绪时的合成兜底
    const p = 0.85 + Math.random() * 0.4;
    this._noise({ dur: 0.13, vol: 0.16 * att, freq: 750 * p, type: 'bandpass', Q: 1.6, slideTo: 160 });
    this._tone({ freq: 190 * p, dur: 0.09, type: 'sine', vol: 0.1 * att, slideTo: 70, delay: 0.01 });
  }

  squadHurt() {
    this._tone({ freq: 210, dur: 0.16, type: 'square', vol: 0.16, slideTo: 95 });
    this._noise({ dur: 0.1, vol: 0.08, freq: 800, type: 'lowpass' });
  }

  // 每种道具一套专属音色
  pickup(type = 'medkit') {
    if (type === 'medkit') {
      // 上行三连音，治愈感
      [660, 880, 1100].forEach((f, i) =>
        this._tone({ freq: f, dur: 0.1, type: 'sine', vol: 0.18, delay: i * 0.06 }));
    } else if (type === 'rage') {
      // 火焰点燃：噪声呼啸 + 低音上冲
      this._noise({ dur: 0.35, vol: 0.14, freq: 500, type: 'bandpass', Q: 0.6, slideTo: 2400 });
      this._tone({ freq: 140, dur: 0.3, type: 'sawtooth', vol: 0.14, slideTo: 320 });
    } else if (type === 'shield') {
      // 能量罩展开：正弦泛音铺开
      [520, 780, 1040].forEach((f, i) =>
        this._tone({ freq: f, dur: 0.45, type: 'sine', vol: 0.1, delay: i * 0.03, attack: 0.08 }));
      this._noise({ dur: 0.3, vol: 0.04, freq: 5000, type: 'highpass', attack: 0.05 });
    } else if (type === 'nuke') {
      // 警报滴声（nuke() 的轰鸣紧随其后）
      this._tone({ freq: 1200, dur: 0.09, type: 'square', vol: 0.14 });
      this._tone({ freq: 1200, dur: 0.09, type: 'square', vol: 0.14, delay: 0.13 });
    }
  }

  weaponUp() {
    [440, 660, 990, 1320].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.1, type: 'square', vol: 0.13, delay: i * 0.055 }));
    this._noise({ dur: 0.25, vol: 0.06, freq: 3000, type: 'highpass', delay: 0.1 });
  }

  nuke() {
    this._tone({ freq: 70, dur: 1.0, type: 'sawtooth', vol: 0.35, slideTo: 28 });
    this._noise({ dur: 0.9, vol: 0.3, freq: 300, type: 'lowpass', slideTo: 60 });
  }

  enemyShot(dist = 0) {
    // 被感染士兵的枪声：比玩家的更闷更哑，随距离衰减
    const att = Math.max(0.15, 1 - dist / 40);
    this._noise({ dur: 0.08, vol: 0.12 * att, freq: 1400, type: 'lowpass', slideTo: 500 });
    this._tone({ freq: 140, dur: 0.07, type: 'square', vol: 0.08 * att, slideTo: 70 });
  }

  throwSkull() {
    // 抡臂掷出的呼啸声
    this._noise({ dur: 0.3, vol: 0.1, freq: 400, type: 'bandpass', Q: 1.2, slideTo: 1400 });
    this._tone({ freq: 120, dur: 0.18, type: 'sawtooth', vol: 0.08, slideTo: 220 });
  }

  skullImpact(dist = 0) {
    const att = Math.max(0.15, 1 - dist / 30);
    // 骨骼碎裂的闷响
    this._noise({ dur: 0.09, vol: 0.2 * att, freq: 1800, type: 'lowpass', slideTo: 300 });
    this._tone({ freq: 95, dur: 0.22, type: 'sine', vol: 0.24 * att, slideTo: 38 });
    this._noise({ dur: 0.18, vol: 0.07 * att, freq: 2600, type: 'highpass', delay: 0.02 });
  }

  hammer() {
    // 重锤砸地：低频巨响 + 地面轰鸣
    this._noise({ dur: 0.12, vol: 0.3, freq: 900, type: 'lowpass', slideTo: 150 });
    this._tone({ freq: 58, dur: 0.7, type: 'sine', vol: 0.4, slideTo: 22 });
    this._noise({ dur: 0.5, vol: 0.14, freq: 220, type: 'lowpass' });
  }

  spikes() {
    // 地刺破土：碎石迸裂的锐响
    this._noise({ dur: 0.16, vol: 0.22, freq: 2400, type: 'bandpass', Q: 0.8, slideTo: 500 });
    this._tone({ freq: 180, dur: 0.14, type: 'sawtooth', vol: 0.12, slideTo: 60 });
  }

  bossRoar() {
    this._tone({ freq: 110, dur: 0.65, type: 'sawtooth', vol: 0.28, slideTo: 55 });
    this._tone({ freq: 165, dur: 0.5, type: 'sawtooth', vol: 0.18, slideTo: 80, delay: 0.05 });
    this._noise({ dur: 0.6, vol: 0.14, freq: 260, type: 'lowpass' });
  }

  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.2, delay: i * 0.09 }));
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.22, delay: i * 0.13 }));
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.3, type: 'sawtooth', vol: 0.16, delay: i * 0.18 }));
  }

  // ---------------- 程序化 BGM ----------------
  // 暗色调 16 步电子循环：底鼓 / 军鼓 / 踩镲 / 低音线 / 长音 Pad
  startBgm() {
    this.ensure();
    if (!this.ctx || this._bgmTimer) return;
    this._bgmStep = 0;
    this._bgmNext = this.ctx.currentTime + 0.1;
    this._bgmTimer = setInterval(() => this._schedule(), 90);
  }

  stopBgm() {
    if (this._bgmTimer) {
      clearInterval(this._bgmTimer);
      this._bgmTimer = null;
    }
  }

  _schedule() {
    const stepDur = 60 / 118 / 2; // 118 BPM 八分音符
    while (this._bgmNext < this.ctx.currentTime + 0.28) {
      this._playStep(this._bgmStep, this._bgmNext, stepDur);
      this._bgmNext += stepDur;
      this._bgmStep = (this._bgmStep + 1) % 32;
    }
  }

  _playStep(step, t, stepDur) {
    const delay = Math.max(0, t - this.ctx.currentTime);
    const bus = this.bgmBus;

    // 底鼓：每拍
    if (step % 4 === 0) {
      this._tone({ freq: 130, dur: 0.13, type: 'sine', vol: 0.5, slideTo: 38, delay, bus });
    }
    // 军鼓：2、4 拍
    if (step % 8 === 4) {
      this._noise({ dur: 0.12, vol: 0.16, freq: 1900, Q: 0.7, delay, bus });
      this._tone({ freq: 190, dur: 0.08, type: 'triangle', vol: 0.12, slideTo: 130, delay, bus });
    }
    // 踩镲：反拍 + 弱十六分
    if (step % 2 === 1) {
      this._noise({ dur: 0.03, vol: 0.055, freq: 6500, type: 'highpass', delay, bus });
    }
    // 低音线：小调进行 A - A - C - G
    const bassLine = [55, 0, 55, 55, 0, 55, 0, 65.4, 65.4, 0, 65.4, 55, 0, 49, 49, 0,
                      55, 0, 55, 55, 0, 55, 0, 65.4, 65.4, 0, 73.4, 73.4, 0, 82.4, 78, 73.4];
    const note = bassLine[step];
    if (note > 0) {
      this._tone({ freq: note, dur: stepDur * 0.9, type: 'sawtooth', vol: 0.22, delay, bus, attack: 0.01 });
      this._tone({ freq: note * 2, dur: stepDur * 0.6, type: 'square', vol: 0.05, delay, bus, attack: 0.01 });
    }
    // Pad：每 4 小节铺一个小调和弦（A2 C3 E3）
    if (step === 0) {
      [110, 130.8, 164.8].forEach((f) =>
        this._tone({ freq: f, dur: stepDur * 30, type: 'triangle', vol: 0.05, delay, bus, attack: 0.4 }));
    }
  }
}
