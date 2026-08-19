// ============================================================ 僵尸类型（致敬 CSOL 生化模式）
import { MAX_ZOMBIE_RENDER } from './config.js';
import { infectedSoldierParts } from './crowd.js';

export const ZOMBIE_TYPES = {
  // 普通僵尸：均衡，技能"暴走"——靠近时短暂提速
  normal: {
    label: '普通僵尸',
    palette: { legs: 0x3d4a2c, torso: 0x5c8a3c, head: 0x8fc46a, arms: 0x74a84e },
    hp: (d) => 1 + Math.floor(d * 1.3),
    speedMul: 1, scaleBase: 0.9, contactLoss: 1, maxRender: MAX_ZOMBIE_RENDER,
    unlockAt: 0,
  },
  // 恶魔猎手：技能"突进"——周期性猛冲
  hunter: {
    label: '恶魔猎手',
    palette: { legs: 0x5a1e1e, torso: 0x8a2a22, head: 0xc4553c, arms: 0xa03828 },
    hp: (d) => 2 + Math.floor(d * 1.1),
    speedMul: 1.15, scaleBase: 0.95, contactLoss: 1, maxRender: 150,
    unlockAt: 150,
  },
  // 憎恶屠夫：血牛肉盾，撞上一次啃掉 3 人
  butcher: {
    label: '憎恶屠夫',
    palette: { legs: 0x2c3038, torso: 0x4a525e, head: 0x9aa4b0, arms: 0x6a7480 },
    hp: (d) => 8 + Math.floor(d * 4.5),
    speedMul: 0.62, scaleBase: 1.5, contactLoss: 3, maxRender: 80,
    unlockAt: 250,
  },
  // 暗影芭比：技能"潜行"——周期性相位隐身，隐身时子弹穿过打不中
  shadow: {
    label: '暗影芭比',
    palette: { legs: 0x2a2438, torso: 0x453a5e, head: 0x8a7ab8, arms: 0x5e5080 },
    hp: (d) => 1 + Math.floor(d * 0.9),
    speedMul: 1.3, scaleBase: 0.85, contactLoss: 1, maxRender: 120,
    unlockAt: 350,
  },
  // 巫蛊术尸：技能"咒疗"——周期性治疗周围僵尸
  witch: {
    label: '巫蛊术尸',
    palette: { legs: 0x1e4038, torso: 0x2a6a58, head: 0x58c4a8, arms: 0x3a8a70 },
    hp: (d) => 2 + Math.floor(d * 1.2),
    speedMul: 0.85, scaleBase: 0.95, contactLoss: 1, maxRender: 60,
    unlockAt: 500,
  },
  // 嗜血女妖：技能"诱捕"——放出蝙蝠把小队拽向自己
  banshee: {
    label: '嗜血女妖',
    palette: { legs: 0x3a1a30, torso: 0x6a2a58, head: 0xc46aa8, arms: 0x8a3a70 },
    hp: (d) => 3 + Math.floor(d * 1.4),
    speedMul: 0.95, scaleBase: 1.0, contactLoss: 1, maxRender: 60,
    unlockAt: 650,
  },
  // 被感染的士兵：保持距离用步枪射击人类，射速低
  infected: {
    label: '被感染的士兵',
    parts: infectedSoldierParts,
    hp: (d) => 2 + Math.floor(d * 1.0),
    speedMul: 0.9, scaleBase: 0.95, contactLoss: 1, maxRender: 80,
    unlockAt: 450,
  },
};
export const ZOMBIE_TYPE_KEYS = Object.keys(ZOMBIE_TYPES);
