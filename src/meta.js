// ============================================================ 局外成长（meta）系统
// 所有升级叠加在每局初始状态上；localStorage 持久化。
// 假付费：mockPurchase 模拟一笔真实付费流程，但钩子直接放行 —— 相当于破解版绕过付款，纯本地模拟。

const META_KEY = 'dg_meta_v1';
const COIN_KEY = 'dg_coins_v1';
const PAID_KEY = 'dg_paid_v1';

// 升级项定义：per 为每级效果数值；paid 项用 price 显示 💎 假价格。
// max 缺省 = 无上限，只要有钱就能无限升（价格随等级线性增长）。
export const META_UPGRADES = [
  { id: 'startSoldiers', name: '老兵征召', icon: '🪖', desc: '每局初始兵力 +5（无限叠加）', baseCost: 20, costStep: 15, per: 5 },
  { id: 'startDmg', name: '军械改造', icon: '🔧', desc: '全武器伤害 +8%（无限叠加）', baseCost: 30, costStep: 20, per: 0.08 },
  { id: 'startRate', name: '扳机训练', icon: '⚡', desc: '射速 +6%（无限叠加）', baseCost: 30, costStep: 20, per: 0.06 },
  { id: 'speed', name: '疾行战靴', icon: '👟', desc: '小队移速 +0.3（无限叠加）', baseCost: 25, costStep: 15, per: 0.3 },
  { id: 'xpGain', name: '实战经验', icon: '📖', desc: '击杀经验获取 +15%（无限叠加）', baseCost: 40, costStep: 25, per: 0.15 },
  { id: 'reinf', name: '增援效率', icon: '📦', desc: '增援/奖励兵力 +10%（无限叠加）', baseCost: 35, costStep: 20, per: 0.1 },
  { id: 'shieldStart', name: '开局护盾', icon: '🛡️', desc: '开局无敌护盾（每级 +3 秒）', baseCost: 60, costStep: 15, per: 3 },
  { id: 'rageStart', name: '开局狂暴', icon: '🔥', desc: '开局狂暴射速 ×2（每级 +3 秒）', baseCost: 60, costStep: 15, per: 3 },
  { id: 'freezeStart', name: '开局冰冻', icon: '❄️', desc: '开局冰冻全场（每级 +3 秒）', baseCost: 80, costStep: 20, per: 3 },
  { id: 'luckyStart', name: '幸运开局', icon: '🍀', desc: '开局随机道具（每级 +1 个）', baseCost: 80, costStep: 20, per: 1 },
  // ---- 假付费（💎 破解钩子直接放行，纯做样子）----
  // 无 max 的付费项可反复「升级」叠加；带 max: 1 的是一次性解锁（外观/一次性道具）。
  { id: 'goldArmy', name: '黄金军团', icon: '👑', desc: '士兵全部变为金色（付费外观）', max: 1, per: 1, paid: true, price: 30 },
  { id: 'doubleCoins', name: '双倍金币', icon: '💰', desc: '金币收益 ×2（每级翻倍，付费特权）', per: 1, paid: true, price: 45 },
  { id: 'startNuke', name: '开局核弹', icon: '☢️', desc: '开局立即引爆核弹清屏（付费道具）', max: 1, per: 1, paid: true, price: 60 },
  { id: 'critStart', name: '暴击血脉', icon: '🎯', desc: '暴击 +20%（每级叠加，付费特权）', per: 0.2, paid: true, price: 35 },
  { id: 'armorStart', name: '硬化体质', icon: '🧱', desc: '近战损耗 -20%（每级叠加，最多 3 级）', max: 3, per: 0.2, paid: true, price: 35 },
  { id: 'weaponMaster', name: '武器大师', icon: '⚔️', desc: '全部武器初始 Lv+1（每级叠加，付费特权）', per: 1, paid: true, price: 50 },
];

export function metaLevels() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; }
}
export function setMetaLevels(lv) {
  localStorage.setItem(META_KEY, JSON.stringify(lv));
}

export function getCoins() {
  return parseInt(localStorage.getItem(COIN_KEY) || '0', 10);
}
export function addCoins(n) {
  const v = Math.max(0, getCoins() + Math.floor(n));
  localStorage.setItem(COIN_KEY, String(v));
  return v;
}

export function paidUnlocked() {
  try { return JSON.parse(localStorage.getItem(PAID_KEY) || '[]'); } catch { return []; }
}
function setPaid(ids) {
  localStorage.setItem(PAID_KEY, JSON.stringify(ids));
}

export function levelCost(upg, level) {
  return upg.baseCost + upg.costStep * level;
}

// 假支付钩子：模拟 0.8s「支付中…」后直接放行，绕过付款机制。
export function mockPurchase(upg) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const ids = paidUnlocked();
      if (!ids.includes(upg.id)) {
        ids.push(upg.id);
        setPaid(ids);
      }
      resolve(true);
    }, 800);
  });
}

// 某一项升级当前叠加值（未解锁的付费项返回 0）
export function metaTotal(upgId) {
  const upg = META_UPGRADES.find((u) => u.id === upgId);
  if (!upg) return 0;
  if (upg.paid) return paidUnlocked().includes(upgId) ? upg.per : 0;
  return (metaLevels()[upgId] || 0) * upg.per;
}

// 开局时快照全部 meta 值（避免每帧读 localStorage）
export function getMetaSnapshot() {
  const lv = metaLevels();
  const paid = paidUnlocked();
  const val = (id) => {
    const u = META_UPGRADES.find((x) => x.id === id);
    return (lv[id] || 0) * (u?.per ?? 0);
  };
  const has = (id) => paid.includes(id);
  // 可叠加付费项：等级存于 metaLevels；已解锁但未再升级的按 1 级算
  const paidLv = (id) => Math.max(has(id) ? 1 : 0, lv[id] || 0);
  const paidPer = (id) => META_UPGRADES.find((x) => x.id === id)?.per ?? 0;
  return {
    startSoldiers: Math.round(val('startSoldiers')),
    startDmg: val('startDmg'),
    startRate: val('startRate'),
    speed: val('speed'),
    xpGain: val('xpGain'),
    reinf: val('reinf'),
    shieldStart: val('shieldStart'),
    rageStart: val('rageStart'),
    freezeStart: val('freezeStart'),
    luckyStart: Math.round(val('luckyStart')),
    goldArmy: has('goldArmy'),
    doubleCoins: 2 ** paidLv('doubleCoins'), // 倍率：1/2/4/8…
    startNuke: has('startNuke'),
    critStart: paidLv('critStart') * paidPer('critStart'),
    armorStart: paidLv('armorStart') * paidPer('armorStart'),
    weaponMaster: paidLv('weaponMaster'), // 全部武器初始等级
  };
}
