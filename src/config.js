// ============================================================ 常量
export const ROAD_W = 11;
export const SQUAD_X_LIMIT = 3.4;
export const MAX_SOLDIER_RENDER = 140;
export const MAX_ZOMBIE_RENDER = 500;      // 允许僵尸铺满整个屏幕
export const MAX_BULLETS = 700;
export const MAX_SQUAD_RADIUS = 2.3;
export const BASE_SPACING = 0.62;
export const MAX_SHOOTERS = 50;
export const GATE_W = 4.6;
export const GATE_H = 3.4;
export const CHUNK_LEN = 120;              // 环境按块无限生成

// 无尽模式节奏（单位：世界距离）
export const GATE_SPACING = 55;            // 门的间隔（比之前稀疏）
export const PICKUP_SPACING = 110;         // 道具箱平均间隔
export const WAVE_SPACING = 26;
export const FIRST_BOSS_AT = 320;
export const BOSS_INTERVAL = 420;

// 难度系数：随跑过的距离无限增长
export const diffAt = (dist) => 1 + dist / 140;

// ============================================================ 武器表
export const WEAPONS = {
  rifle:   { name: '🔫 步枪',   kind: 'tracer', rate: 2.6,  dmg: 1,   speed: 44, color: 0xffe27a, pellets: 1, spread: 0,    aoe: 0,   size: 1 },
  shotgun: { name: '💥 霰弹枪', kind: 'tracer', rate: 1.6,  dmg: 1,   speed: 40, color: 0xffa94a, pellets: 3, spread: 0.42, aoe: 0,   size: 1.25 },
  minigun: { name: '🌀 加特林', kind: 'tracer', rate: 5.2,  dmg: 0.6, speed: 52, color: 0x9fffd0, pellets: 1, spread: 0.12, aoe: 0,   size: 0.75 },
  rocket:  { name: '🚀 火箭筒', kind: 'rocket', rate: 0.8,  dmg: 5,   speed: 28, color: 0xff6a3a, pellets: 1, spread: 0,    aoe: 2.2, size: 1 },
  tesla:   { name: '⚡ 电击器', kind: 'zap',    rate: 0.75, dmg: 3.2, speed: 0,  color: 0x7ae4ff, pellets: 1, spread: 0,    aoe: 0,   size: 1 },
  flamer:  { name: '🔥 喷火器', kind: 'flame',  rate: 5.5,  dmg: 0.4, speed: 21, color: 0xff9a3a, pellets: 2, spread: 0.4, aoe: 0.8, size: 1, range: 22 },
};
export const WEAPON_KEYS = Object.keys(WEAPONS);

// ============================================================ 道具表
export const ITEMS = {
  medkit: { icon: '➕', name: '增援',  color: 0x3ddc84 },
  rage:   { icon: '🔥', name: '狂暴',  color: 0xff7a3a },
  shield: { icon: '🛡️', name: '护盾', color: 0x58baff },
  laser:  { icon: '🔆', name: '全屏激光', color: 0xff4a6a },
  freeze: { icon: '❄️', name: '冰冻', color: 0x9adfff },
  nuke:   { icon: '☢️', name: '核弹', color: 0xffd24a },
};
export const ITEM_KEYS = Object.keys(ITEMS);
