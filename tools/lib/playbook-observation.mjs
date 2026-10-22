// Offline, bounded transaction ledger. Instance observers are deliberately dropped by forkPrep.
export function observePrepTransactions(m, record, { enabled = false, limit = 2000 } = {}) {
  if (!enabled) return;
  record.transactions = [];
  for (const ps of m.players.values()) for (const action of ['buy','sell','refresh','levelUp','equip','pickReward']) {
    const original = ps[action].bind(ps);
    ps[action] = (...args) => {
      const before = {funds:ps.funds,spent:ps.round.spent,level:ps.shop.level,free:ps.shop.freeRefreshes};
      const slot = action === 'buy' ? ps.shop.slots[args[0]] : null;
      const item = action === 'equip' ? ps.find(args[0])?.piece?.id : null;
      const result = original(...args);
      if (record.transactions.length < limit) record.transactions.push({round:m.round,pid:ps.playerId,action,
        argument:args[0]??null,target:action==='equip'?args[1]:null,id:slot?.id??item,
        ok:result?.ok===true,fundsBefore:before.funds,fundsAfter:ps.funds,
        spent:ps.round.spent-before.spent,levelBefore:before.level,levelAfter:ps.shop.level,
        freeBefore:before.free,freeAfter:ps.shop.freeRefreshes});
      return result;
    };
  }
}
