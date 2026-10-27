#!/usr/bin/env node
// Local different-family second rater for the arm audit. No network.
// Samples correct rows per arm and re-judges the 18 wrong-shown audit rows.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chatWithUsage } from '../kit/lib/model.mjs'
const argv=process.argv.slice(2)
const opt=(n,d)=>{const i=argv.indexOf('--'+n);return i>=0?argv[i+1]:d}
const rowsPath=opt('rows','bench/results/arm-compare-heldout-deepseek-v2-bcd.jsonl')
const qPath=opt('questions','bench/results/ooh-test-private-v2.jsonl')
const keyPath=opt('key','bench/results/audit-v2/audit-key.json')
const sheetPath=opt('sheet','bench/results/audit-v2/audit-sheet.csv')
const outPath=opt('out','bench/results/second-rater/results.jsonl')
const rows=readFileSync(rowsPath,'utf8').split('\n').filter(Boolean).map(JSON.parse)
const items=new Map(readFileSync(qPath,'utf8').split('\n').filter(Boolean).map(x=>{const o=JSON.parse(x);return [o.id,o]}))
const model={baseUrl:'http://localhost:11434/v1',apiKey:'ollama',model:'llama3.1:8b'}
const prompt=(q,g,a)=>`You are an independent strict grader. Decide whether ANSWER correctly answers QUESTION given GOLD. For partial questions, the answer is correct only if it states every stated part and explicitly says the missing part is not stated. Do not use outside knowledge. Reply with exactly one word: YES, NO, or UNSURE.\n\nQuestion: ${q}\nGOLD: ${typeof g==='object'?JSON.stringify(g):g}\nANSWER: ${a}`
const parse=s=>{const m=/\b(YES|NO|UNSURE)\b/i.exec(String(s));return m?m[1].toUpperCase():'UNSURE'}
async function judge(q,g,a){const r=await chatWithUsage(model,[{role:'user',content:prompt(q,g,a)}],{maxTokens:4,think:false});return parse(r.content)}
// 10 answerable + 10 unanswerable + 5 partial correct per arm, evenly spread
const sample=[]
for (const arm of ['B','C','D']) for (const [cond,n] of [['answerable',10],['unanswerable',10],['partial',5]]) {
  const X=rows.filter(r=>r.arm===arm&&r.condition===cond&&r.correct)
  const idx=[...new Set(Array.from({length:Math.min(n,X.length)},(_,i)=>Math.round(i*(X.length-1)/Math.max(1,Math.min(n,X.length)-1))))]
  for (const i of idx) sample.push({...X[i],source:'correct'})
}
// wrong-shown audit rows
const key=JSON.parse(readFileSync(keyPath,'utf8'))
const sheet=readFileSync(sheetPath,'utf8').split('\n').slice(1).filter(Boolean)
const wrong=[]
for (const [aid,g] of Object.entries(key)) {
  const it=items.get(g.id); const m=g.members[0]
  wrong.push({arm:m.arm,id:g.id,condition:it.condition,text:g.text,source:'wrong',audit_id:aid})
}
const out=[]
for (const r of [...sample,...wrong]) {
  const it=items.get(r.id); let verdict
  try { verdict=await judge(it.question,it.gold,r.text) } catch(e) { verdict='ERROR:'+e.message }
  out.push({...r,second_rater:verdict})
}
const { dirname } = await import('node:path'); mkdirSync(dirname(outPath),{recursive:true})
writeFileSync(outPath,out.map(x=>JSON.stringify(x)).join('\n')+'\n')
console.log(`judged ${out.length} rows -> ${outPath}`)
