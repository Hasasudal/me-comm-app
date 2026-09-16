const encoder=new TextEncoder();

export async function hashAdminCode(code:string,salt:string){
 const key=await crypto.subtle.importKey('raw',encoder.encode(code),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:600000},key,256);
 return Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function verifyAdminCode(code:string,salt:string,expected:string){
 const actual=await hashAdminCode(code,salt);
 let difference=actual.length^expected.length;
 for(let index=0;index<actual.length;index++)difference|=actual.charCodeAt(index)^expected.charCodeAt(index);
 return difference===0;
}
