// Deterministic, bounded round scheduler. Hard preferences are never relaxed.
export const pairKey = (a,b) => [a,b].sort().join(':');
export function compatible(a,b,blocked=new Set()) {
  return a.id!==b.id && !blocked.has(pairKey(a.id,b.id)) && a.age>=b.min_age && a.age<=b.max_age && b.age>=a.min_age && b.age<=a.max_age;
}
export function affinity(a,b){const common=(a.interests||[]).filter(x=>(b.interests||[]).includes(x)).length;return common*8+(a.intent===b.intent?4:0)+(a.location.toLowerCase()===b.location.toLowerCase()?2:0)}
export function scheduleRounds(participants, rounds=5, blocked=new Set()) {
  if(participants.length>40)throw new Error('An event supports up to 40 people.');
  const people=[...participants].sort((a,b)=>a.id.localeCompare(b.id));
  const seen=new Set(),counts=new Map(people.map(p=>[p.id,0])),plan=[];
  for(let round=0;round<rounds;round++){
    // Pick the least-connected person first, then favour shared interests.
    const remaining=[...people].sort((a,b)=>counts.get(a.id)-counts.get(b.id)||a.id.localeCompare(b.id));
    const pairs=[];
    while(remaining.length){const a=remaining.shift();let best=-1,bestScore=-Infinity;
      for(let i=0;i<remaining.length;i++){const b=remaining[i];if(!compatible(a,b,blocked)||seen.has(pairKey(a.id,b.id)))continue;
        const score=affinity(a,b)-counts.get(b.id)*100;
        if(score>bestScore){best=i;bestScore=score}}
      if(best>=0){const b=remaining.splice(best,1)[0];pairs.push([a.id,b.id]);seen.add(pairKey(a.id,b.id));counts.set(a.id,counts.get(a.id)+1);counts.set(b.id,counts.get(b.id)+1)}
    }
    if(!pairs.length)break;
    plan.push(pairs);
  }
  return plan;
}
export function phaseAt(event,now=Date.now()){
  if(event.status!=='live')return {phase:event.status};
  const start=Date.parse(event.started_at),elapsed=(now-start)/1000;
  if(elapsed<0)return {phase:'welcome',seconds:Math.ceil(-elapsed)};
  const cycle=event.round_seconds+event.break_seconds,round=Math.floor(elapsed/cycle)+1;
  if(round>event.total_rounds)return {phase:'finished'};
  const position=elapsed%cycle;
  return {phase:position<event.round_seconds?'date':'decision',round,seconds:Math.ceil((position<event.round_seconds?event.round_seconds:cycle)-position)};
}
