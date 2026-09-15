const encoder=new TextEncoder();
export async function hashPassword(password:string,salt:string){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256);
 return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyPassword(password:string,salt:string,expected:string){
 const actual=await hashPassword(password,salt);
 let difference=actual.length^expected.length;
 for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return difference===0;
}
