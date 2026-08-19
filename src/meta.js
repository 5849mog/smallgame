// ============================================================ 局外成长（meta）系统
// 所有升级叠加在每局初始状态上；localStorage 持久化。
// 假付费：mockPurchase 模拟一笔真实付费流程，但钩子直接放行 —— 相当于破解版绕过付款，纯本地模拟。

const META_KEY = 'dg_meta_v1';
const COIN_KEY = 'dg_coins_v1';
const PAID_KEY = 'dg_paid_v1';

// 升级项定义：per 为每级效果数值；paid 项用 price 显示 💎 假价格
export const META_UPGRADES = [
  { id: 'startSoldiers', name: '老兵征召', icon: '🪖', desc: '每局初始兵力 +5', max: 5, baseCost: 20, costStep: 15, per: 5 },
  { id: 'startDmg', name: '军械改造', icon: '🔧', desc: '全武器伤害 +8%', max: 5, baseCost: 30, costStep: 20, per: 0.08 },
  { id: 'startRate', name: '扳机训练', icon: '⚡', desc: '射速 +6%', max: 5, baseCost: 30, costStep: 20, per: 0.06 },
  { id: 'speed', name: '疾行战靴', icon: '👟', desc: '小队移速 +0.3', max: 5, baseCost: 25, costStep: 15, per: 0.3 },
  { id: 'xpGain', name: '实战经验', icon: '📖', desc: '击杀经验获取 +15%', max: 5, baseCost: 40, costStep: 25, per: 0.15 },
  { id: 'reinf', name: '增援效率', icon: '📦', desc: '增援/奖励兵力 +10%', max: 5, baseCost: 35, costStep: 20, per: 0.1 },
  { id: 'shieldStart', name: '开局护盾', icon: '🛡️', desc: '开局 3 秒无敌护盾', max: 1, baseCost: 60, costStep: 0, per: 3 },
  { id: 'rageStart', name: '开局狂暴', icon: '🔥', desc: '开局 3 秒狂暴（射速 ×2）', max: 1, baseCost: 60, costStep: 0, per: 3 },
  { id: 'freezeStart', name: '开局冰冻', icon: '❄️', desc: '开局 3 秒冰冻全场', max: 1, baseCost: 80, costStep: 0, per: 3 },
  { id: 'luckyStart', name: '幸运开局', icon: '🍀', desc: '开局随机获得一个道具效果', max: 1, baseCost: 80, costStep: 0, per: 1 },
  // ---- 假付费（💎 破解钩子直接放行，纯做样子）----
  { id: 'goldArmy', name: '黄金军团', icon: '👑', desc: '士兵全部变为金色（付费外观）', max: 1, per: 1, paid: true, price: 30 },
  { id: 'doubleCoins', name: '双倍金币', icon: '💰', desc: '每局金币收益 ×2（付费特权）', max: 1, per: 1, paid: true, price: 45 },
  { id: 'startNuke', name: '开局核弹', icon: '☢️', desc: '开局立即引爆核弹清屏（付费道具）', max: 1, per: 1, paid: true, price: 60 },
  { id: 'critStart', name: '暴击血脉', icon: '🎯', desc: '开局暴击 +20%（付费特权）', max: 1, per: 0.2, paid: true, price: 35 },
  { id: 'armorStart', name: '硬化体质', icon: '🧱', desc: '开局护甲：近战损耗 -20%（付费特权）', max: 1, per: 0.2, paid: true, price: 35 },
  { id: 'weaponMaster', name: '武器大师', icon: '⚔️', desc: '开局全部武器 Lv1（付费特权）', max: 1, per: 1, paid: true, price: 50 },
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
  const paidVal = (id) => (has(id) ? (META_UPGRADES.find((x) => x.id === id)?.per ?? 0) : 0);
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
    luckyStart: val('luckyStart'),
    goldArmy: has('goldArmy'),
    doubleCoins: has('doubleCoins'),
    startNuke: has('startNuke'),
    critStart: paidVal('critStart'),
    armorStart: paidVal('armorStart'),
    weaponMaster: has('weaponMaster'),
  };
}
