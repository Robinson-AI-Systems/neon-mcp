// Central checked PostgreSQL identifier escape for trusted bounded catalog names.
export function quoteIdent(value){
 if(typeof value!=='string'||value.length<1||
    Buffer.byteLength(value,'utf8')>63||
    /[\u0000-\u001f\u007f]/.test(value))
  throw Error('Untrusted PostgreSQL identifier');
 return '"'+value.replaceAll('"','""')+'"';
}
