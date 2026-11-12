export const MAX_ATTACHMENT_BYTES=10*1024*1024;
export function validateAttachment(file:Pick<File,'size'|'type'>){
 if(file.size===0||file.size>MAX_ATTACHMENT_BYTES)throw new Error('الملف فارغ أو يتجاوز 10 ميجابايت');
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw new Error('ارفع صورة JPG أو PNG أو WEBP أو ملف PDF');
}