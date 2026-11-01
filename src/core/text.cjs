'use strict';
const {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/\r\n?/g, '\n').trim();
const SYNONYMS = [/回覆|回复|回答|答复/g, /偏好|喜欢|更喜欢|倾向于/g, /使用|采用|用/g];
function semanticText(text) {
  let s = normalize(text).replace(/^(?:请)?(?:记住|记一下|remember)[:：,，\s]*/u, '');
  for (let i=0;i<SYNONYMS.length;i++) s=s.replace(SYNONYMS[i], ['回答','偏好','使用'][i]);
  return s.replace(/(?:请|以后|今后|默认|更|总是|一直|务必|希望|我|我们|的|地|得)/gu,'').replace(/[\s\p{P}\p{S}]+/gu,'');
}
function tokens(text) {
  const s=normalize(text); const result=[];
  for(const m of s.matchAll(/[a-z0-9_]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu)) {
    const word=m[0];
    if (/^[a-z0-9_]+$/.test(word)) result.push(word);
    else {const chars=Array.from(word);result.push(...chars);for(let i=0;i<chars.length-1;i++)result.push(chars[i]+chars[i+1]);}
  }
  return result;
}
function similarity(a,b) {
  const x=semanticText(a),y=semanticText(b);if(x===y)return 1;
  const A=new Set(tokens(x)),B=new Set(tokens(y));if(!A.size||!B.size)return 0;
  const overlap=[...A].filter(t=>B.has(t)).length;return 2*overlap/(A.size+B.size);
}
function countWords(text) {
  return [...new Intl.Segmenter('zh',{granularity:'word'}).segment(String(text))].filter(x=>x.isWordLike).length;
}
const STABLE=/(?:记住|记一下|以后|今后|始终|总是|偏好|喜欢|习惯|不要再|永远|发布流程|项目约定|项目目标|长期|remember|always|never|prefer|from now on|our (?:policy|convention))/iu;
const TEMPORARY=/(?:正在|刚刚|稍后|待会|今天先|本次先|临时|进度|还剩\d|正在运行|天气|几点|帮我(?:看|查|修|写|跑)|run (?:the )?tests|current progress|temporary|for this turn)/iu;
function stableCandidate(text) {
  const s=String(text).trim();
  const question=/[?？]|^(?:为什么|为何|怎么|如何|是否|能否|可否|why\b|how\b|what\b|when\b|where\b|who\b|do\b|does\b|did\b|is\b|are\b|can\b|could\b|should\b|would\b)|(?:要不要|是不是|有没有|能不能|会不会|可不可以|需不需要)|(?:吗|么|呢)[。！!…\s]*$|(?:记住|记得|记下|知道)(?:了)?(?:没有|没)[。！!…\s]*$/iu;
  const hypothetical=/(?:要是|假如|假设|倘若|如果|就好了|以后再说|(?:这|本)(?:周|次|回)先)|\b(?:what if|suppose|if we|if i)\b/iu;
  const praise=/(?:喜欢|满意|不错|很棒|很好|感谢)/u.test(s)&&/(?:刚才|刚刚|这次|这回|那个|这个).*(?:回答|回复|答复|解释|建议|结果|方案)/u.test(s)||/(?:i (?:like|love)|great|good).*\b(?:that|this|last|previous)\b.*\b(?:answer|response|explanation)\b/iu.test(s);
  if(!s||s.length>4000||/^(?:网页(?:内容)?|工具输出|压缩摘要|web(?:page)?|tool output|compaction summary)\s*[:：]/iu.test(s)||sensitiveReason(s)||question.test(s)||hypothetical.test(s)||praise||TEMPORARY.test(s))return false;
  return STABLE.test(s)&&/(?:记住|记一下|\bremember\b|以后(?!再说)|今后|默认|偏好|喜欢|习惯|不要再|永远|发布流程|项目约定|项目目标|长期|^(?:please\s+)?(?:remember|always|never)\s+(?:use|run|do|reply|respond|answer|avoid|keep)|\b(?:i|we)\s+(?:prefer|always use|never use)|from now on|our (?:policy|convention))/iu.test(s);
}
function extractCandidates(text) {
  const clean=String(text).replace(/```[\s\S]*?(?:```|$)/gu,'');
  return clean.split(/\r?\n/u).filter(line=>!/^\s*(?:>|\[?(?:INFO|DEBUG|TRACE|ERROR)\]?[:\s])/iu.test(line)).flatMap(line=>[...new Intl.Segmenter('zh',{granularity:'sentence'}).segment(line)])
    .map(x=>x.segment.trim()).filter(stableCandidate)
    .map(body=>({body:body.replace(/^(?:请)?(?:记住|记一下|remember)[:：\s]*/iu,''),type:inferType(body)}))
    .filter(f=>f.body.trim());
}
function semanticSignature(text) {
  const s=normalize(text);const negative=/(?:不要|不再|别|don't|never)/iu.test(s);
  if(/(?:回答|回复|回覆|答复|respond|reply|answer)/iu.test(s)){
    const value=/(?:中文|汉语|chinese)/iu.test(s)?'zh':/(?:英文|英语|english)/iu.test(s)?'en':null;
    if(value)return {topic:'response-language',value:(negative?'not-':'')+value};
  }
  if(/(?:包管理|package manager)/iu.test(s)){const value=/\b(pnpm|npm|yarn|bun)\b/iu.exec(s)?.[1];if(value)return {topic:'package-manager',value:(negative?'not-':'')+value};}
  const base=semanticText(s).replace(/(?:不要再|不要|不再|禁止|别|不(?=使用)|do\s*not|don't|never|not|avoid)/giu,'').replace(/^(?:i|we|please|remember|fromnowon)+/giu,'');
  return base?{topic:`fact:${base}`,value:negative||/(?:禁止|不使用|\bnot\b|\bavoid\b)/iu.test(s)?'negative':'positive'}:null;
}
function inferType(text) {if(/项目|发布|部署|分支|release|project|staging/iu.test(text))return 'project';return /不要|纠正|不对|改正|instead|don't|stop doing/iu.test(text)?'feedback':/https?:\/\/|文档地址|参考链接/iu.test(text)?'reference':/项目|发布|部署|分支|release|project|staging/iu.test(text)?'project':'user';}
function estimateTokens(text) {return Math.ceil(Array.from(String(text)).reduce((n,c)=>n+(/[\u2e80-\uffff]/u.test(c)?1:0.27),0));}
function truncate(text,chars) {const list=Array.from(String(text));return list.slice(0,Math.max(0,chars)).join('');}
function sensitiveReason(text){
  const s=String(text).normalize('NFKC').replace(/\\+(?=["'])/gu,'');
  if(/(?:gh[pousr]_[a-z0-9_-]{4,}|github_pat_[a-z0-9_]{4,}|sk-ant-[a-z0-9_-]{4,}|sk-(?:proj-)?[a-z0-9_-]{12,}|BEGIN [A-Z ]*PRIVATE KEY)/iu.test(s))return 'credential-pattern';
  const assignments=/(?:password|passphrase|passwd|密码|口令|api[ _-]?key|access[ _-]?token|auth[ _-]?token|secret[ _-]?key|token)["']?\s*(是|为|就是|设为|\bis\b|\bare\b|[:=：])\s*/giu;
  for(const match of s.matchAll(assignments)){
    const tail=s.slice(match.index+match[0].length),quoted=/^["']/u.test(tail);const value=(quoted?tail.slice(1).split(tail[0])[0]:tail.split(/[\r\n"']/u)[0]).trim();if(!value)continue;
    // Natural-language descriptions of storage/rotation/billing are knowledge,
    // not literal secrets. This exception never applies to explicit assignments
    // or quoted values, and scanning continues for any later credential.
    const natural=/^(?:是|为|就是|is|are)$/iu.test(match[1]);
    const process=/^(?:(?:用|使用|通过|经过|由).*(?:哈希|散列|加密|存储|生成|刷新|验证|轮换|签发|管理|派生)|(?:按|按照).*(?:计费|计价|计算))/u.test(value)||/^(?:(?:automatically\s+)?(?:refreshed|rotated|renewed|generated|issued|validated)\s+(?:every|on|when|by|using)\b|(?:hashed|encrypted|stored)\s+(?:with|using|in|as|by)\b|(?:charged|billed)\s+(?:per|by|using)\b)/iu.test(value);
    if(natural&&!quoted&&process)continue;
    return 'credential-assignment';
  }
  return null;
}
function assertSafe(text){const reason=sensitiveReason(text);if(reason)throw Object.assign(new Error(`Sensitive content refused (${reason}); remove the credential and retry`),{code:'SENSITIVE_CONTENT',reason});}
// Retrieval requires meaningful words/bigrams. Single CJK characters and English
// function words cannot establish relevance, even when their BM25 score is high.
const STOP=new Set('i me my we our you your the a an is are was be to of in on at for and or it this that what why how does do always never prefer please help'.split(' '));
function retrievalTokens(text){return tokens(text).filter(t=>!STOP.has(t)&&(!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(t))&&!/^(?:以后|今后|这个|那个|什么|怎么|帮我|看看|一下|我的|我们|你的|总是|不要)$/u.test(t));}
module.exports={hash,normalize,semanticText,semanticSignature,tokens,retrievalTokens,similarity,countWords,stableCandidate,extractCandidates,inferType,estimateTokens,truncate,sensitiveReason,assertSafe};
