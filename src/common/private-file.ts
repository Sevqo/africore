import {createHash} from 'node:crypto';

/** Bounded signature validation, never a claim that a file is malware-free. */
export function validatePrivateFile(filename:string,contentType:string,base64:string,maxBytes=512*1024){
 const reject=(message:string):never=>{throw Object.assign(new Error(message),{status:400});};
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_. -]{0,119}$/.test(filename)||filename.includes('..'))reject('Use a plain filename without path segments');
 if(!['application/pdf','image/png','image/jpeg','text/plain'].includes(contentType))reject('Unsupported file type');
 const extensions:Record<string,string[]>={'application/pdf':['pdf'],'image/png':['png'],'image/jpeg':['jpg','jpeg'],'text/plain':['txt']};if(!extensions[contentType].includes(filename.split('.').pop()!.toLowerCase()))reject('Filename extension must match the permitted content type');
 if(base64.length>Math.ceil(maxBytes/3)*4||!base64.length||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))reject('Invalid or oversized Base64 file');
 const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>maxBytes||bytes.toString('base64')!==base64)reject('File exceeds the supported size or encoding');
 if(contentType==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')reject('Invalid PDF signature');
 if(contentType==='image/png'&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')reject('Invalid PNG signature');
 if(contentType==='image/jpeg'&&bytes.subarray(0,3).toString('hex')!=='ffd8ff')reject('Invalid JPEG signature');
 const dimensions=(width:number,height:number)=>{if(!width||!height||width>4096||height>4096||width*height>10000000)reject('Images must fit within 4096 pixels per side and 10 million pixels');};
 if(contentType==='image/png'){if(bytes.length<33||bytes.readUInt32BE(8)!==13||bytes.subarray(12,16).toString()!=='IHDR'||bytes.subarray(-12).toString('hex')!=='0000000049454e44ae426082')reject('Invalid or incomplete PNG structure');dimensions(bytes.readUInt32BE(16),bytes.readUInt32BE(20));}
 if(contentType==='image/jpeg'){
  if(bytes.subarray(-2).toString('hex')!=='ffd9')reject('Incomplete JPEG structure');let offset=2,found=false;
  while(offset<bytes.length-2){if(bytes[offset++]!==255)reject('Invalid JPEG marker');while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;if(offset+2>bytes.length)reject('Incomplete JPEG segment');const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)reject('Invalid JPEG segment length');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)reject('Invalid JPEG dimensions');dimensions(bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3));found=true;break;}offset+=length;}
  if(!found)reject('JPEG dimensions could not be safely established');
 }
 if(contentType==='text/plain'){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{reject('Text files must use valid UTF-8');}if(bytes.includes(0))reject('Binary content is not a plain text file');}
 return {bytes,size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),scan_status:'not_malware_scanned',file_validation:'bounded_type_and_signature_checks_only'};
}
