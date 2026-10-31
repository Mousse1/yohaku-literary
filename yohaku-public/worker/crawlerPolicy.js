export const robotsText="# Public reading URLs are available to search and user-requested AI fetchers.\n# Applies to ChatGPT-User, OAI-SearchBot, Claude-User, Claude-SearchBot,\n# Googlebot and other compliant agents. Authorization is enforced by the server.\nUser-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/public/works\nDisallow: /admin\nDisallow: /mine\nDisallow: /submit\nDisallow: /revise\n"

// REP matching for post-deployment audit, including more-specific managed groups.
export function robotsAllows(text,agent,path) {
  const groups=[];let group={agents:[],rules:[],hasRules:false}
  for(const raw of String(text).split(/\r?\n/)){
    const line=raw.split('#')[0].trim(),colon=line.indexOf(':')
    if(colon<0)continue
    const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim()
    if(key==='user-agent'){
      if(group.hasRules){groups.push(group);group={agents:[],rules:[],hasRules:false}}
      group.agents.push(value.toLowerCase())
    }else if(['allow','disallow'].includes(key)){group.hasRules=true;if(value)group.rules.push({allow:key==='allow',path:value})}
  }
  groups.push(group)
  const ua=agent.toLowerCase()
  const scores=groups.map(g=>Math.max(-1,...g.agents.map(a=>a==='*'?0:ua.includes(a)?a.length:-1)))
  const best=Math.max(-1,...scores)
  const rules=groups.flatMap((g,i)=>scores[i]===best?g.rules:[])
  let specificity=-1,allowed=true
  for(const rule of rules){
    const regex=rule.path.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')
    if(!new RegExp('^'+regex).test(path))continue
    const size=rule.path.replace(/[*$]/g,'').length
    if(size>specificity||(size===specificity&&rule.allow)){specificity=size;allowed=rule.allow}
  }
  return allowed
}
