export const MATCH_DECISION_LABELS:Record<string,string>={
  SUGGESTED:"Vorgemerkt",
  VIEWED:"Angesehen",
  SENT:"Gesendet",
  CONTACT:"Kontaktieren",
  INTERESTED:"Interessant",
  VIEWING_REQUESTED:"Besichtigung",
  REJECTED:"Abgelehnt",
  UNSUITABLE:"Ungeeignet",
};

export const MATCH_GROUPS=[
  {key:"VERY_GOOD",label:"Sehr passend",hint:"85–100 %",className:"very-good",minScore:85},
  {key:"GOOD",label:"Passend",hint:"70–84 %",className:"good",minScore:70},
  {key:"PARTIAL",label:"Teilweise passend",hint:"50–69 %",className:"partial",minScore:50},
  {key:"NOT",label:"Nicht passend",hint:"unter 50 %",className:"not",minScore:0},
] as const;

const DECISION_RANK:Record<string,number>={
  VIEWING_REQUESTED:0,
  CONTACT:1,
  INTERESTED:2,
  SENT:3,
  VIEWED:4,
  SUGGESTED:5,
  REJECTED:8,
  UNSUITABLE:9,
};

export function isDeprioritizedDecision(status:string|null|undefined){
  return status==="REJECTED"||status==="UNSUITABLE";
}

export function matchGroupForScore(scoreValue:unknown){
  const score=Number(scoreValue);
  if(score>=85)return MATCH_GROUPS[0];
  if(score>=70)return MATCH_GROUPS[1];
  if(score>=50)return MATCH_GROUPS[2];
  return MATCH_GROUPS[3];
}

function decisionRank(status:string|null|undefined){
  return status?DECISION_RANK[status]??6:6;
}

export function sortMatchingRows<T extends {score:unknown;decision_status?:string|null}>(rows:T[]){
  return rows.slice().sort((a,b)=>{
    const deprioritized=Number(isDeprioritizedDecision(a.decision_status))-Number(isDeprioritizedDecision(b.decision_status));
    if(deprioritized!==0)return deprioritized;
    const groupDelta=MATCH_GROUPS.indexOf(matchGroupForScore(a.score))-MATCH_GROUPS.indexOf(matchGroupForScore(b.score));
    if(groupDelta!==0)return groupDelta;
    const decisionDelta=decisionRank(a.decision_status)-decisionRank(b.decision_status);
    if(decisionDelta!==0)return decisionDelta;
    return Number(b.score)-Number(a.score);
  });
}

export function groupMatchingRows<T extends {score:unknown;decision_status?:string|null}>(rows:T[]){
  const sorted=sortMatchingRows(rows);
  return MATCH_GROUPS.map((group)=>({
    group,
    items:sorted.filter((row)=>matchGroupForScore(row.score).key===group.key),
  }));
}
