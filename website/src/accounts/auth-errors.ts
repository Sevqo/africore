/** Recognize the installed Neon adapter's normalized error and the provider wire code. */
export function needsEmailVerification(error:unknown){
 if(!error||typeof error!=='object'||!('code' in error)||typeof error.code!=='string')return false;
 return ['EMAIL_NOT_VERIFIED','EMAIL_NOT_CONFIRMED'].includes(error.code.toUpperCase());
}
