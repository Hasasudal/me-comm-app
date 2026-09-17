// Creates .prod.vars for `wrangler secret bulk`: a fresh admin code hash/salt plus the Firebase web config from .dev.vars.
// The admin code itself is never written to disk. Hashing must match lib/admin-code.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, webcrypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const local=Object.fromEntries(readFileSync('.dev.vars','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1).trim()]));
const firebaseKeys=['FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID'];
const missing=firebaseKeys.filter(key=>!local[key]);
if(missing.length)throw new Error(`.dev.vars에 값이 없습니다: ${missing.join(', ')}`);

const rl=createInterface({input:process.stdin,output:process.stdout});
const lines=rl[Symbol.asyncIterator]();
const ask=async question=>{process.stdout.write(question);return String((await lines.next()).value??'').trim();};
const code=await ask('운영용 관리자 코드 (12~128자, 영문·숫자·기호 섞어서): ');
const confirm=await ask('한 번 더 입력: ');
rl.close();
if(code!==confirm)throw new Error('두 입력이 다릅니다.');
if(code.length<12||code.length>128)throw new Error('관리자 코드는 12자 이상 128자 이하여야 합니다.');
if(code==='Local-admin-code-1234')throw new Error('테스트용 코드는 운영에 쓸 수 없습니다.');

const encoder=new TextEncoder();
const salt=randomBytes(16).toString('hex');
const key=await webcrypto.subtle.importKey('raw',encoder.encode(code),'PBKDF2',false,['deriveBits']);
const bits=await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256);
const hash=Buffer.from(bits).toString('hex');

writeFileSync('.prod.vars',[`ADMIN_JOIN_CODE_HASH=${hash}`,`ADMIN_JOIN_CODE_SALT=${salt}`,...firebaseKeys.map(key=>`${key}=${local[key]}`),''].join('\n'));
console.log('\n.prod.vars를 만들었습니다. 다음을 실행한 뒤 파일을 지워주세요:\n  npx wrangler secret bulk .prod.vars');
